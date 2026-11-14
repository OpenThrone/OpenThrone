/**
 * WebSocket load harness for the Durable Objects realtime pilot (#23).
 *
 *   bun scripts/loadtest-chat.ts --room 42 --tickets tickets.txt
 *   bun scripts/loadtest-chat.ts --base-url http://127.0.0.1:8787 --room 42 \
 *       --tickets tickets.txt --concurrency 20 --messages-per-conn 5
 *
 * Opens `--concurrency` native WebSockets to `<base>/do/chat/<room>` (one
 * ticket per line of `--tickets`, round-robin; tickets may repeat when there
 * are fewer tickets than connections — the DO accepts multiple connections
 * per ticket, and the per-USER 10 sends/10 s limit is shared, so scale the
 * send rate accordingly), waits for each connection's `hello` frame, then
 * every connection sends `--messages-per-conn` sendMessage frames spaced
 * `--send-interval-ms` apart (default 1000 ms keeps a shared ticket under
 * the 10/10 s limiter). Per connection it records:
 *
 * - send→receive RTT: time from a sendMessage frame until the matching
 *   `receiveMessage` frame (matched by the echoed `tempId`) — p50/p95/p99/max;
 * - `receiveMessage` count and the set of tempIds seen — the fanout check:
 *   after a `--drain-ms` quiet period every connection must have seen every
 *   sent tempId (each send is broadcast to all room subscribers).
 *
 * Protocol failures (connect failure, no hello, non-JSON frame, any
 * `messageError` event, unexpected close, fanout shortfall) are collected as
 * failure reasons; the final stdout line is a single JSON summary and the
 * process exits nonzero when any failure was recorded. Percentile math is
 * reused from scripts/loadtest-preview.ts (issue #26's HTTP harness).
 *
 * Zero dependencies: global WebSocket + fetch (Bun provides both).
 * The pure parts (arg parsing, summary building, failure rules) are exported
 * for unit tests. Ticket minting is out of scope on purpose — see
 * docs/realtime-pilot.md §8.2 for the documented mint-then-immediately-run
 * flow (tickets expire 60 s after minting).
 */

import { percentileMs, UsageError } from './loadtest-preview';

/** Preview deployment from wrangler.jsonc (NEXTAUTH_URL of the `preview` env). */
export const DEFAULT_BASE_URL = 'https://openthrone-preview.example.workers.dev';

export const DEFAULT_CONCURRENCY = 10;
export const DEFAULT_MESSAGES_PER_CONN = 5;
export const DEFAULT_SEND_INTERVAL_MS = 1_000;
export const DEFAULT_DRAIN_MS = 3_000;
/** Hard ceiling for the whole connect+hello phase per connection. */
export const CONNECT_TIMEOUT_MS = 15_000;

export interface ChatLoadtestConfig {
  readonly baseUrl: string;
  readonly room: number;
  readonly tickets: readonly string[];
  readonly concurrency: number;
  readonly messagesPerConn: number;
  readonly sendIntervalMs: number;
  readonly drainMs: number;
}

export interface ConnectionResult {
  index: number;
  ticketIndex: number;
  connected: boolean;
  /** tempIds whose matching receiveMessage never arrived. */
  missingTempIds: number[];
  /** receiveMessage frames received (own + others'). */
  receivedCount: number;
  /** RTT samples in ms, one per echoed sendMessage. */
  rtts: number[];
  errors: string[];
}

export interface ChatLoadtestSummary {
  baseUrl: string;
  room: number;
  connections: number;
  tickets: number;
  messagesPerConn: number;
  startedAt: string;
  totalSent: number;
  totalReceived: number;
  rtts: {
    samples: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    maxMs: number | null;
  };
  perConnection: Array<{
    index: number;
    connected: boolean;
    sent: number;
    receivedCount: number;
    missing: number;
    p50Ms: number | null;
    errors: string[];
  }>;
  passed: boolean;
  failureReasons: readonly string[];
}

const USAGE = `Usage: bun scripts/loadtest-chat.ts --room <id> --tickets <file> [options]

Load-tests the Durable Objects chat pilot with concurrent WebSockets and
prints a one-line JSON summary. Requires room-scoped tickets minted from
POST /api/realtime/ticket (see docs/realtime-pilot.md §10) — they expire
60 s after minting, so mint immediately before running.

Options:
  --base-url <url>         Target origin (default: ${DEFAULT_BASE_URL})
  --room <id>              Chat room id (required)
  --tickets <file>         File with one ticket per line (required)
  --concurrency <n>        Parallel connections (default: ${DEFAULT_CONCURRENCY})
  --messages-per-conn <n>  Sends per connection (default: ${DEFAULT_MESSAGES_PER_CONN})
  --send-interval-ms <n>   Delay between sends (default: ${DEFAULT_SEND_INTERVAL_MS})
  --drain-ms <n>           Quiet period before the fanout check (default: ${DEFAULT_DRAIN_MS})
  --help                   Show this text

Exits nonzero on any protocol failure: connect failure, missing hello frame,
non-JSON frame, messageError event, unexpected close, or a fanout shortfall
(any connection missing any sent tempId).
`;

const parsePositiveInt = (name: string, raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new UsageError(
      `${USAGE}\n${name} must be a positive integer, got: ${raw}`,
    );
  }
  return value;
};

const readTickets = async (path: string): Promise<string[]> => {
  const file = Bun.file(path);
  const text = await file.text();
  const tickets = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (tickets.length === 0) {
    throw new UsageError(
      `${USAGE}\n--tickets file contained no tickets: ${path}`,
    );
  }
  return tickets;
};

export const parseChatLoadtestArgs = async (
  argv: readonly string[],
  readFile: (path: string) => Promise<string[]> = readTickets,
): Promise<ChatLoadtestConfig> => {
  let baseUrl = DEFAULT_BASE_URL;
  let room: number | null = null;
  let ticketsPath: string | null = null;
  let concurrency = DEFAULT_CONCURRENCY;
  let messagesPerConn = DEFAULT_MESSAGES_PER_CONN;
  let sendIntervalMs = DEFAULT_SEND_INTERVAL_MS;
  let drainMs = DEFAULT_DRAIN_MS;

  const needValue = (flag: string, value: string | undefined): string => {
    if (value === undefined || value === '') {
      throw new UsageError(`${USAGE}\n${flag} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    const takeValue = (): string => {
      const value = needValue(arg, argv[index + 1]);
      index += 1;
      return value;
    };
    if (arg === '--help' || arg === '-h') throw new UsageError(USAGE);
    if (arg === '--base-url') baseUrl = takeValue();
    else if (arg.startsWith('--base-url='))
      baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--room') room = parsePositiveInt('--room', takeValue());
    else if (arg.startsWith('--room='))
      room = parsePositiveInt('--room', arg.slice('--room='.length));
    else if (arg === '--tickets') ticketsPath = takeValue();
    else if (arg.startsWith('--tickets='))
      ticketsPath = arg.slice('--tickets='.length);
    else if (arg === '--concurrency')
      concurrency = parsePositiveInt('--concurrency', takeValue());
    else if (arg.startsWith('--concurrency='))
      concurrency = parsePositiveInt(
        '--concurrency',
        arg.slice('--concurrency='.length),
      );
    else if (arg === '--messages-per-conn')
      messagesPerConn = parsePositiveInt('--messages-per-conn', takeValue());
    else if (arg.startsWith('--messages-per-conn='))
      messagesPerConn = parsePositiveInt(
        '--messages-per-conn',
        arg.slice('--messages-per-conn='.length),
      );
    else if (arg === '--send-interval-ms')
      sendIntervalMs = parsePositiveInt('--send-interval-ms', takeValue());
    else if (arg.startsWith('--send-interval-ms='))
      sendIntervalMs = parsePositiveInt(
        '--send-interval-ms',
        arg.slice('--send-interval-ms='.length),
      );
    else if (arg === '--drain-ms')
      drainMs = parsePositiveInt('--drain-ms', takeValue());
    else if (arg.startsWith('--drain-ms='))
      drainMs = parsePositiveInt('--drain-ms', arg.slice('--drain-ms='.length));
    else throw new UsageError(`${USAGE}\nunknown argument: ${arg}`);
  }

  if (room === null) throw new UsageError(`${USAGE}\n--room is required`);
  if (ticketsPath === null)
    throw new UsageError(`${USAGE}\n--tickets is required`);

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new UsageError(
      `--base-url must be an absolute http(s) URL, got: ${baseUrl}`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UsageError(`--base-url must use http or https, got: ${baseUrl}`);
  }

  const tickets = await readFile(ticketsPath);
  return {
    baseUrl: parsed.origin,
    room,
    tickets,
    concurrency,
    messagesPerConn,
    sendIntervalMs,
    drainMs,
  };
};

/** Nearest-rank percentile over raw samples (sorted internally). */
const percentileOf = (samples: readonly number[], p: number): number | null => {
  if (samples.length === 0) return null;
  return percentileMs(
    [...samples].sort((a, b) => a - b),
    p,
  );
};

export const buildChatSummary = (
  config: ChatLoadtestConfig,
  startedAt: Date,
  results: readonly ConnectionResult[],
): ChatLoadtestSummary => {
  const totalSent = config.messagesPerConn * config.concurrency;
  const allRtts = results.flatMap((result) => result.rtts);
  const totalReceived = results.reduce(
    (sum, result) => sum + result.receivedCount,
    0,
  );

  const failureReasons: string[] = [];
  for (const result of results) {
    for (const error of result.errors) {
      failureReasons.push(`connection ${result.index}: ${error}`);
    }
    if (!result.connected) {
      failureReasons.push(`connection ${result.index}: never connected`);
    }
    if (result.missingTempIds.length > 0) {
      failureReasons.push(
        `connection ${result.index}: missing ${result.missingTempIds.length}/${totalSent} broadcast tempIds (fanout shortfall)`,
      );
    }
  }
  // Every connection must see every sent message: total fanout check.
  const expectedPerConn = totalSent;
  const shortfalls = results.filter(
    (result) => result.receivedCount < expectedPerConn,
  );
  if (shortfalls.length > 0) {
    failureReasons.push(
      `${shortfalls.length}/${results.length} connections received fewer than ${expectedPerConn} broadcasts`,
    );
  }

  return {
    baseUrl: config.baseUrl,
    room: config.room,
    connections: config.concurrency,
    tickets: config.tickets.length,
    messagesPerConn: config.messagesPerConn,
    startedAt: startedAt.toISOString(),
    totalSent,
    totalReceived,
    rtts: {
      samples: allRtts.length,
      p50Ms: percentileOf(allRtts, 50),
      p95Ms: percentileOf(allRtts, 95),
      p99Ms: percentileOf(allRtts, 99),
      maxMs: allRtts.length === 0 ? null : Math.round(Math.max(...allRtts)),
    },
    perConnection: results.map((result) => ({
      index: result.index,
      connected: result.connected,
      sent: config.messagesPerConn,
      receivedCount: result.receivedCount,
      missing: result.missingTempIds.length,
      p50Ms: percentileOf(result.rtts, 50),
      errors: result.errors,
    })),
    passed: failureReasons.length === 0,
    failureReasons,
  };
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface RunState {
  result: ConnectionResult;
  /** tempId -> sentAt ms, removed when the echo arrives (RTT sample). */
  pendingTempIds: Map<number, number>;
  /** tempIds this connection has observed in any receiveMessage frame. */
  receivedTempIds: Set<number>;
  allSentTempIds: Set<number>;
  /** Live socket, closed by runChatLoadtest after the fanout check. */
  socket?: WebSocket;
}

const runConnection = async (
  config: ChatLoadtestConfig,
  index: number,
  allStates: Set<RunState>,
): Promise<void> => {
  const ticket = config.tickets[index % config.tickets.length]!;
  const result: ConnectionResult = {
    index,
    ticketIndex: index % config.tickets.length,
    connected: false,
    missingTempIds: [],
    receivedCount: 0,
    rtts: [],
    errors: [],
  };
  const state: RunState = {
    result,
    pendingTempIds: new Map(),
    receivedTempIds: new Set(),
    allSentTempIds: new Set(),
  };
  allStates.add(state);

  const url = `${config.baseUrl.replace(/^http/, 'ws')}/do/chat/${config.room}?ticket=${encodeURIComponent(ticket)}`;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch (error: unknown) {
    result.errors.push(`connect threw: ${String(error)}`);
    return;
  }
  state.socket = socket;

  const hello = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('hello timeout')),
      CONNECT_TIMEOUT_MS,
    );
    socket.onmessage = (event: MessageEvent) => {
      let frame: { event?: unknown; payload?: unknown };
      try {
        frame = JSON.parse(String(event.data)) as {
          event?: unknown;
          payload?: unknown;
        };
      } catch {
        result.errors.push('non-JSON frame received');
        return;
      }
      if (frame.event === 'hello') {
        result.connected = true;
        clearTimeout(timer);
        resolve();
        return;
      }
      reject(new Error(`first frame was ${String(frame.event)}`));
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('websocket error before hello'));
    };
    socket.onclose = () => {
      clearTimeout(timer);
      reject(new Error('closed before hello'));
    };
  });

  try {
    await hello;
  } catch (error: unknown) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return;
  }

  // Steady-state handler: RTT matching + fanout accounting.
  socket.onmessage = (event: MessageEvent) => {
    let frame: { event?: unknown; payload?: { tempId?: unknown } };
    try {
      frame = JSON.parse(String(event.data)) as {
        event?: unknown;
        payload?: { tempId?: unknown };
      };
    } catch {
      result.errors.push('non-JSON frame received');
      return;
    }
    if (frame.event === 'receiveMessage') {
      result.receivedCount += 1;
      const tempId = Number(frame.payload?.tempId);
      if (Number.isFinite(tempId) && tempId !== 0) {
        state.receivedTempIds.add(tempId);
      }
      const sentAt = state.pendingTempIds.get(tempId);
      if (sentAt !== undefined) {
        state.pendingTempIds.delete(tempId);
        result.rtts.push(performance.now() - sentAt);
      }
    } else if (frame.event === 'messageError') {
      result.errors.push(`messageError: ${JSON.stringify(frame.payload)}`);
    }
  };
  socket.onclose = () => {
    if (result.errors.length === 0 && result.receivedCount === 0) {
      result.errors.push('unexpected close during run');
    }
  };
  socket.onerror = () => undefined;

  for (let seq = 0; seq < config.messagesPerConn; seq += 1) {
    // +1: tempId 0 is unusable — the receive filter ignores 0 (it would be
    // indistinguishable from a missing echo field), and index 0 / seq 0
    // would otherwise mint it and fail every connection's fanout check.
    const tempId = index * 1_000_000 + seq + 1;
    state.allSentTempIds.add(tempId);
    state.pendingTempIds.set(tempId, performance.now());
    socket.send(
      JSON.stringify({
        type: 'sendMessage',
        roomId: config.room,
        content: `loadtest conn${index} msg${seq}`,
        tempId,
      }),
    );
    if (seq < config.messagesPerConn - 1) {
      await sleep(config.sendIntervalMs);
    }
  }
};

export const runChatLoadtest = async (
  config: ChatLoadtestConfig,
): Promise<ChatLoadtestSummary> => {
  const startedAt = new Date();
  const states = new Set<RunState>();

  await Promise.all(
    Array.from({ length: config.concurrency }, (_unused, index) =>
      runConnection(config, index, states),
    ),
  );

  // Drain: wait for in-flight broadcasts before the fanout check.
  await sleep(config.drainMs);

  // Fanout check: every connection must have observed every sent tempId —
  // each sendMessage is broadcast to all room subscribers.
  const everySentTempId = new Set<number>();
  for (const state of states) {
    for (const tempId of state.allSentTempIds) everySentTempId.add(tempId);
  }
  const results: ConnectionResult[] = [];
  for (const state of states) {
    state.result.missingTempIds = [...everySentTempId].filter(
      (tempId) => !state.receivedTempIds.has(tempId),
    );
    results.push(state.result);
  }

  // Close every connection so the CLI process can exit once the summary is
  // printed — open sockets keep the event loop alive otherwise.
  for (const state of states) {
    try {
      state.socket?.close();
    } catch {
      // already closed by the server or a prior error path
    }
  }

  return buildChatSummary(config, startedAt, results);
};

if (import.meta.main) {
  try {
    const config = await parseChatLoadtestArgs(process.argv.slice(2));
    process.stderr.write(
      `OpenThrone chat load test: ${config.baseUrl} room=${config.room} ` +
        `connections=${config.concurrency} (tickets=${config.tickets.length}) ` +
        `messages/conn=${config.messagesPerConn}\n`,
    );
    const summary = await runChatLoadtest(config);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (!summary.passed) {
      process.stderr.write(
        `FAILED: ${summary.failureReasons.slice(0, 20).join('; ')}\n`,
      );
    }
    process.exitCode = summary.passed ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
