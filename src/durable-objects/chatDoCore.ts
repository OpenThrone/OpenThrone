/**
 * Pure logic for the ChatRoomDO Durable Object (issue #23 pilot).
 *
 * Everything here is dependency-free and workerd-free so `bun test` can cover
 * the DO's brain — inbound validation, per-connection rate limiting, room
 * membership bookkeeping, hibernation metadata (de)serialization, and fanout
 * planning — with plain fakes; see `chatDoCore.test.ts`. The `ChatRoomDO`
 * class in `./ChatRoomDO.ts` is a thin adapter that wires these functions to
 * `this.ctx` / `this.env`, mirroring how `src/lib/workerCron.ts` keeps the
 * worker entry testable.
 *
 * Like workerCron, this file must stay import-clean (no `@/` aliases, no
 * libraries) because it is reachable from `worker.ts`, which wrangler bundles
 * without the Next path aliases.
 */

// ---------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------

/**
 * Hard cap on one inbound websocket frame, in bytes (not characters — the
 * byte length is what bounds workerd memory). Deliberate pilot bound: the
 * Node/Socket.IO path has NO application-level cap today (section 5.3 of
 * docs/realtime-pilot.md) and inherits only the engine default, so the pilot
 * introduces an explicit one instead.
 */
export const MAX_INBOUND_FRAME_BYTES = 32 * 1024;

/** Parity with the Socket.IO limiter: 10 sendMessage per 10 s (per user). */
export const SEND_MESSAGE_WINDOW_MS = 10_000;
export const SEND_MESSAGE_MAX = 10;

/**
 * Coarse cap on ALL inbound frames per connection (any type). markAsRead has
 * no limiter on the Socket.IO path; this bounds garbage/abuse traffic the
 * Socket.IO path leaves to engine latency alone.
 */
export const INBOUND_FRAME_WINDOW_MS = 10_000;
export const INBOUND_FRAME_MAX = 60;

/** ReadStatusSchema parity: at most 100 ids per markAsRead (Messaging.service). */
export const MAX_MARK_AS_READ_IDS = 100;

export const ALLOWED_MESSAGE_TYPES = ['TEXT', 'ATTACK_LOG_SHARE'] as const;

/** Validated client → DO frame. Unknown fields are dropped, not forwarded. */
export type ParsedInboundFrame =
  | {
      type: 'sendMessage';
      roomId: number;
      content: string;
      /** Opaque here; MessagingService's SendMessageSchema validates it. */
      richContent?: Record<string, unknown>;
      clientMessageId?: string;
      tempId?: number;
      replyToMessageId?: number;
      messageType?: string;
      sharedAttackLogId?: number;
    }
  | {
      type: 'markAsRead';
      roomId: number;
      messageIds: number[];
    };

export type FrameParseFailure = {
  ok: false;
  reason:
    | 'too-large'
    | 'not-json'
    | 'not-object'
    | 'unknown-type'
    | 'invalid-fields';
  /** Best-effort tempId echo so the client can clear its optimistic row. */
  tempId?: number;
  /** Best-effort echo so the sender's pending acknowledgement settles. */
  clientMessageId?: string;
};

export type FrameParseResult =
  | { ok: true; frame: ParsedInboundFrame }
  | FrameParseFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSafePositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const byteLength = (raw: string): number =>
  new TextEncoder().encode(raw).length;

const extractTempId = (parsed: unknown): number | undefined => {
  const candidate = isRecord(parsed) ? parsed.tempId : undefined;
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : undefined;
};

/** RFC 4122 shape, matching the z.string().uuid() check behind the send path. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const extractClientMessageId = (parsed: unknown): string | undefined => {
  const candidate = isRecord(parsed) ? parsed.clientMessageId : undefined;
  return typeof candidate === 'string' && UUID_PATTERN.test(candidate)
    ? candidate
    : undefined;
};

/**
 * Parses and validates one inbound frame. Size is checked before JSON.parse
 * so oversized payloads never allocate a parsed object.
 */
export const parseInboundFrame = (raw: unknown): FrameParseResult => {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'not-json' };
  }
  if (byteLength(raw) > MAX_INBOUND_FRAME_BYTES) {
    return { ok: false, reason: 'too-large' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json', tempId: undefined };
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return {
      ok: false,
      reason: 'not-object',
      tempId: extractTempId(parsed),
      clientMessageId: extractClientMessageId(parsed),
    };
  }

  if (parsed.type === 'sendMessage') {
    const { roomId, content } = parsed;
    if (!isSafePositiveInt(roomId) || typeof content !== 'string') {
      return {
        ok: false,
        reason: 'invalid-fields',
        tempId: extractTempId(parsed),
        clientMessageId: extractClientMessageId(parsed),
      };
    }
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        reason: 'invalid-fields',
        tempId: extractTempId(parsed),
        clientMessageId: extractClientMessageId(parsed),
      };
    }
    const messageType =
      parsed.messageType === undefined || parsed.messageType === null
        ? undefined
        : parsed.messageType;
    if (
      messageType !== undefined &&
      (typeof messageType !== 'string' ||
        !(ALLOWED_MESSAGE_TYPES as readonly string[]).includes(messageType))
    ) {
      return {
        ok: false,
        reason: 'invalid-fields',
        tempId: extractTempId(parsed),
        clientMessageId: extractClientMessageId(parsed),
      };
    }
    const { replyToMessageId } = parsed;
    if (
      replyToMessageId !== undefined &&
      replyToMessageId !== null &&
      !isSafePositiveInt(replyToMessageId)
    ) {
      return {
        ok: false,
        reason: 'invalid-fields',
        tempId: extractTempId(parsed),
        clientMessageId: extractClientMessageId(parsed),
      };
    }
    const { sharedAttackLogId } = parsed;
    if (
      sharedAttackLogId !== undefined &&
      sharedAttackLogId !== null &&
      !isSafePositiveInt(sharedAttackLogId)
    ) {
      return {
        ok: false,
        reason: 'invalid-fields',
        tempId: extractTempId(parsed),
        clientMessageId: extractClientMessageId(parsed),
      };
    }

    const { clientMessageId, richContent } = parsed;
    if (
      (clientMessageId !== undefined &&
        clientMessageId !== null &&
        (typeof clientMessageId !== 'string' ||
          !UUID_PATTERN.test(clientMessageId))) ||
      (richContent !== undefined &&
        richContent !== null &&
        !isRecord(richContent))
    ) {
      return {
        ok: false,
        reason: 'invalid-fields',
        tempId: extractTempId(parsed),
        clientMessageId: extractClientMessageId(parsed),
      };
    }

    const frame: ParsedInboundFrame = {
      type: 'sendMessage',
      roomId,
      content,
    };
    if (typeof clientMessageId === 'string') {
      frame.clientMessageId = clientMessageId;
    }
    if (isRecord(richContent)) {
      frame.richContent = richContent;
    }
    const { tempId } = parsed;
    if (typeof tempId === 'number' && Number.isFinite(tempId)) {
      frame.tempId = tempId;
    }
    if (isSafePositiveInt(replyToMessageId)) {
      frame.replyToMessageId = replyToMessageId;
    }
    if (messageType !== undefined) {
      frame.messageType = messageType;
    }
    if (isSafePositiveInt(sharedAttackLogId)) {
      frame.sharedAttackLogId = sharedAttackLogId;
    }
    return { ok: true, frame };
  }

  if (parsed.type === 'markAsRead') {
    const { roomId } = parsed;
    if (!isSafePositiveInt(roomId)) {
      return { ok: false, reason: 'invalid-fields' };
    }
    const rawIds =
      'messageIds' in parsed
        ? parsed.messageIds
        : isSafePositiveInt(parsed.messageId)
          ? [parsed.messageId]
          : undefined;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return { ok: false, reason: 'invalid-fields' };
    }
    if (rawIds.length > MAX_MARK_AS_READ_IDS) {
      return { ok: false, reason: 'invalid-fields' };
    }
    const messageIds: number[] = [];
    for (const id of rawIds) {
      if (!isSafePositiveInt(id)) {
        return { ok: false, reason: 'invalid-fields' };
      }
      messageIds.push(id);
    }
    return { ok: true, frame: { type: 'markAsRead', roomId, messageIds } };
  }

  return {
    ok: false,
    reason: 'unknown-type',
    tempId: extractTempId(parsed),
    clientMessageId: extractClientMessageId(parsed),
  };
};

// ---------------------------------------------------------------------------
// Server → client frames
// ---------------------------------------------------------------------------

/**
 * Envelope for every DO → client frame. `event`/`payload` mirror the
 * Socket.IO event names one-to-one (receiveMessage, messageError,
 * newMessageNotification, messagesRead) so the browser transport can feed
 * them straight into the existing listener registry (`useSocket`).
 */
export const buildServerFrame = (event: string, payload: unknown): string =>
  JSON.stringify({ event, payload });

// ---------------------------------------------------------------------------
// Per-connection rate limiting (fixed window)
// ---------------------------------------------------------------------------

/**
 * Fixed-window counter, keyed per connection. In-memory by design: it is an
 * early rejection bound only — the authoritative 10/10 s per-user limit stays
 * the Postgres-backed `rateLimiter` behind `/api/realtime/send` (invariant 5
 * in docs/realtime-pilot.md §6), which survives DO hibernation and restarts.
 * Windows resetting after a hibernation wake is accepted and documented.
 */
export class FixedWindowCounter {
  private readonly max: number;

  private readonly windowMs: number;

  private readonly now: () => number;

  private readonly hits = new Map<
    string,
    { windowStart: number; count: number }
  >();

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Records one hit for `key`; false when the window is exhausted. */
  tryAcquire(key: string): boolean {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      this.prune(now);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  /** Drops expired windows so the map cannot grow unbounded. */
  private prune(now: number): void {
    for (const [key, entry] of this.hits.entries()) {
      if (now - entry.windowStart >= this.windowMs) {
        this.hits.delete(key);
      }
    }
  }

  /** Test/inspection hook. */
  get size(): number {
    return this.hits.size;
  }
}

// ---------------------------------------------------------------------------
// Hibernation-safe membership bookkeeping
// ---------------------------------------------------------------------------

/**
 * Structural slice of a hibernating WebSocket as the DO uses it: the standard
 * send/close plus the Durable Objects attachment API that survives eviction
 * (this is the "serialize/deserialize connection metadata" surface).
 */
export interface HibernatingSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(attachment: unknown): void;
  deserializeAttachment(): unknown;
}

/** Metadata persisted per socket through hibernation. */
export interface ConnectionMeta {
  userId: number;
  connectedAt: number;
}

export const CONNECTION_META_VERSION = 1;

interface StoredConnectionMeta extends ConnectionMeta {
  v: number;
}

export const serializeConnectionMeta = (
  meta: ConnectionMeta,
): StoredConnectionMeta => ({
  v: CONNECTION_META_VERSION,
  userId: meta.userId,
  connectedAt: meta.connectedAt,
});

/** Strict reader for attachment data; null on anything unexpected. */
export const deserializeConnectionMeta = (
  raw: unknown,
): ConnectionMeta | null => {
  if (!isRecord(raw)) return null;
  if (raw.v !== CONNECTION_META_VERSION) return null;
  if (!isSafePositiveInt(raw.userId)) return null;
  if (
    typeof raw.connectedAt !== 'number' ||
    !Number.isFinite(raw.connectedAt)
  ) {
    return null;
  }
  return { userId: raw.userId, connectedAt: raw.connectedAt };
};

/**
 * userId → sockets index over the DO's websockets. Everything is derivable
 * from `deserializeAttachment`, so the index can be rebuilt at any time from
 * `ctx.getWebSockets()` after a hibernation wake or restart — the DO keeps it
 * warm only as an optimization.
 */
export class RoomMembership {
  private readonly socketsByUser = new Map<
    number,
    Set<HibernatingSocketLike>
  >();

  /** Builds the index from live (possibly hibernated) sockets. */
  constructor(sockets: readonly HibernatingSocketLike[] = []) {
    for (const socket of sockets) {
      const meta = deserializeConnectionMeta(socket.deserializeAttachment());
      if (meta) {
        this.add(socket, meta.userId);
      }
    }
  }

  /** Alias of the constructor; reads better at rebuild sites. */
  static fromSockets(
    sockets: readonly HibernatingSocketLike[],
  ): RoomMembership {
    return new RoomMembership(sockets);
  }

  add(socket: HibernatingSocketLike, userId: number): void {
    let set = this.socketsByUser.get(userId);
    if (!set) {
      set = new Set();
      this.socketsByUser.set(userId, set);
    }
    set.add(socket);
  }

  remove(socket: HibernatingSocketLike): void {
    for (const [userId, set] of this.socketsByUser.entries()) {
      set.delete(socket);
      if (set.size === 0) {
        this.socketsByUser.delete(userId);
      }
    }
  }

  userIdOf(socket: HibernatingSocketLike): number | null {
    for (const [userId, set] of this.socketsByUser.entries()) {
      if (set.has(socket)) return userId;
    }
    return null;
  }

  userIds(): Set<number> {
    return new Set(this.socketsByUser.keys());
  }

  socketsOf(userId: number): HibernatingSocketLike[] {
    return Array.from(this.socketsByUser.get(userId) ?? []);
  }

  allSockets(): HibernatingSocketLike[] {
    const all: HibernatingSocketLike[] = [];
    for (const set of this.socketsByUser.values()) {
      all.push(...set);
    }
    return all;
  }

  get connectionCount(): number {
    return this.allSockets().length;
  }

  get userCount(): number {
    return this.socketsByUser.size;
  }
}

// ---------------------------------------------------------------------------
// Fanout + eviction planning
// ---------------------------------------------------------------------------

/**
 * Sends one framed event to every socket; returns the delivery count.
 * Per-socket send failures are swallowed (a dead socket is cleaned up by its
 * own close handler) — delivery is best-effort, Postgres is the source of
 * truth.
 */
export const broadcastFrame = (
  sockets: readonly HibernatingSocketLike[],
  event: string,
  payload: unknown,
): number => {
  const frame = buildServerFrame(event, payload);
  let delivered = 0;
  for (const socket of sockets) {
    try {
      socket.send(frame);
      delivered += 1;
    } catch {
      // Best effort; close handler owns cleanup.
    }
  }
  return delivered;
};

/**
 * Connected userIds that are no longer room participants — the lazy-eviction
 * set. The participant list comes back with every /api/realtime/send and
 * /api/realtime/read response, so a removed member's subscription dies on the
 * room's next activity even though the DO cannot see the DELETE that removed
 * them (eviction parity discussion in docs/realtime-pilot.md §7).
 */
export const planEvictions = (
  membership: RoomMembership,
  participantUserIds: readonly number[],
): number[] => {
  const participants = new Set(participantUserIds);
  const evictions: number[] = [];
  for (const userId of membership.userIds()) {
    if (!participants.has(userId)) {
      evictions.push(userId);
    }
  }
  return evictions;
};

// ---------------------------------------------------------------------------
// Internal endpoint contracts (shared by the DO and /api/realtime/*)
// ---------------------------------------------------------------------------

/** Response body of POST /api/realtime/send on success. */
export interface SendEndpointSuccess {
  message: Record<string, unknown>;
  tempId?: number;
  /** A retried clientMessageId: already fanned out by the original send. */
  deduplicated?: boolean;
  participantUserIds: number[];
  notification: {
    id: number;
    senderId: number;
    senderName: string;
    content: string;
    timestamp: string;
    isRead: false;
    chatRoomId: number;
  } | null;
}

/** Response body of POST /api/realtime/read on success. */
export interface ReadEndpointSuccess {
  roomId: number;
  updates: { messageId: number; userId: number; readAt: string }[];
  participantUserIds: number[];
}

/** Response body of both endpoints on failure. */
export interface RealtimeEndpointError {
  error: string;
}
