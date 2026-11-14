/**
 * ChatRoomDO — Durable Object for the realtime pilot (issue #23, parts 2–3).
 *
 * One instance per chat room (`idFromName("room:<id>")`) plus one personal
 * "mailbox" instance per user (`idFromName("user:<id>")`) served by the same
 * class — the mailbox is how `newMessageNotification` reaches a client whose
 * room socket is pointed at a different room's DO (the badge question in
 * docs/realtime-pilot.md §6 TODO).
 *
 * Design constraints honored here:
 *
 * - **WebSocket Hibernation API.** Sockets are accepted with
 *   `ctx.acceptWebSocket` and events arrive through `webSocketMessage`; the
 *   DO holds no always-on timer, so an idle room costs nothing. Connection
 *   metadata (userId) survives eviction via socket attachments, and the DO's
 *   identity survives restarts via `ctx.storage`.
 * - **Postgres stays the source of truth.** The DO never writes messages. It
 *   calls the existing services through the same `WORKER_SELF_REFERENCE`
 *   service-binding + raw `TASK_SECRET` header contract the Cron fan-out uses
 *   (`src/lib/workerCron.ts`): POST /api/realtime/send persists via
 *   `MessagingService.sendMessageRealtime` and POST /api/realtime/read via
 *   `MessagingService.markMessagesAsRead`. The DO owns connections and
 *   fanout only.
 * - **Zero cloudflare imports.** This class deliberately does not extend
 *   `DurableObject` from `cloudflare:workers` (RPC is not used; the
 *   hibernation handlers are duck-typed by the runtime) and talks to its
 *   environment through the structural interfaces below, so `bun test` can
 *   instantiate it with fakes — same philosophy as `src/lib/workerCron.ts`.
 *   It is re-exported from `worker.ts` for wrangler.
 * - **No `@/` imports.** Anything reachable from `worker.ts` is bundled by
 *   wrangler's esbuild, which does not resolve the Next path aliases; the
 *   shared helpers are imported relatively and are themselves import-clean.
 */

import { verifyRealtimeTicket } from '../lib/realtimeTicket';
import {
  DO_INTERNAL_ORIGIN,
  DO_SEND_ACK_EVENT,
  USER_MAILBOX_NOTIFY_EVENTS,
  USER_MAILBOX_NOTIFY_URL,
} from '../lib/realtimeTransport';
import {
  broadcastFrame,
  buildServerFrame,
  deserializeConnectionMeta,
  FixedWindowCounter,
  type HibernatingSocketLike,
  INBOUND_FRAME_MAX,
  INBOUND_FRAME_WINDOW_MS,
  MAX_INBOUND_FRAME_BYTES,
  type ParsedInboundFrame,
  parseInboundFrame,
  planEvictions,
  type ReadEndpointSuccess,
  type RealtimeEndpointError,
  RoomMembership,
  type RoomMembership as RoomMembershipType,
  SEND_MESSAGE_MAX,
  SEND_MESSAGE_WINDOW_MS,
  type SendEndpointSuccess,
  serializeConnectionMeta,
} from './chatDoCore';

// ---------------------------------------------------------------------------
// Structural runtime types (no cloudflare:workers dependency)
// ---------------------------------------------------------------------------

/** Subset of DurableObjectStorage the DO uses. */
export interface DoStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

/** Subset of a hibernation-enabled DurableObjectState the DO uses. */
export interface DoStateLike {
  readonly storage: DoStorageLike;
  acceptWebSocket(ws: unknown, tags?: string[]): void;
  getWebSockets(tag?: string): HibernatingSocketLike[];
}

/** Fetch signature of a Workers service binding. */
export type DoFetchLike = (
  input: RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

/** Subset of a DurableObjectNamespace binding. */
export interface DoNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch: DoFetchLike };
}

/** Bindings the DO reads from the worker env. */
export interface ChatRoomDoEnv {
  CHAT_ROOM_DO?: DoNamespaceLike;
  WORKER_SELF_REFERENCE?: { fetch: DoFetchLike };
  TASK_SECRET?: string;
  JWT_SECRET?: string;
}

/** The server half of the WebSocketPair created per connection. */
export interface WebSocketPairLike {
  server: HibernatingSocketLike;
  client: unknown;
}

/** DO identity, persisted once and asserted on every later fetch. */
interface DoIdentity {
  kind: 'room' | 'user';
  roomId?: number;
  userId?: number;
}

const IDENTITY_STORAGE_KEY = 'do-identity';

const SEND_ENDPOINT_URL = `${DO_INTERNAL_ORIGIN}/api/realtime/send`;
const READ_ENDPOINT_URL = `${DO_INTERNAL_ORIGIN}/api/realtime/read`;

/* eslint-disable no-console -- console is Workers' log stream (wrangler tail
   and the dashboard); the worker entry has no logger import, matching
   src/lib/workerCron.ts. */

export class ChatRoomDO {
  /**
   * Injectable WebSocketPair factory so bun tests can drive `fetch()`
   * upgrades without workerd; production defaults to the runtime global.
   */
  static createWebSocketPair: () => WebSocketPairLike = () => {
    const Ctor = (
      globalThis as unknown as {
        WebSocketPair?: new () => unknown;
      }
    ).WebSocketPair;
    if (!Ctor) {
      throw new Error('WebSocketPair is not available in this runtime');
    }
    // workerd's WebSocketPair is `{ 0: <client>, 1: <server> }` — the named
    // client/server properties of older examples no longer exist (see the
    // WebSockets runtime API docs; the documented destructuring is
    // `let [client, server] = Object.values(new WebSocketPair())`). Accept
    // both shapes so bun-test fakes (named keys) and workerd (numeric keys)
    // both work, and fail loudly on anything else.
    const raw = new Ctor() as unknown as Record<number | string, unknown> &
      Partial<WebSocketPairLike>;
    const server = raw.server ?? raw[1];
    const client = raw.client ?? raw[0];
    if (!server || !client) {
      throw new Error(
        'WebSocketPair returned neither named nor numeric socket keys',
      );
    }
    return { server, client } as WebSocketPairLike;
  };

  private readonly ctx: DoStateLike;

  private readonly env: ChatRoomDoEnv;

  private identity: DoIdentity | null = null;

  private identityLoaded = false;

  private membership: RoomMembershipType | null = null;

  /** Per-connection early rate limits (in-memory; see chatDoCore notes). */
  private readonly sendMessageLimiter = new FixedWindowCounter(
    SEND_MESSAGE_MAX,
    SEND_MESSAGE_WINDOW_MS,
  );

  private readonly inboundFrameLimiter = new FixedWindowCounter(
    INBOUND_FRAME_MAX,
    INBOUND_FRAME_WINDOW_MS,
  );

  /** Monotonic per-DO connection ids, used as limiter keys. */
  private nextConnectionSeq = 0;

  private readonly connectionKeys = new WeakMap<object, string>();

  constructor(ctx: DoStateLike, env: ChatRoomDoEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  // -----------------------------------------------------------------
  // HTTP entry: websocket upgrades + internal /notify
  // -----------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/notify') {
      return this.handleNotify(request);
    }

    const upgradeHeader = (request.headers.get('upgrade') || '').toLowerCase();
    if (upgradeHeader !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    const pathIdentity = this.parseIdentityFromPath(url.pathname);
    if (!pathIdentity) {
      return new Response('Not found', { status: 404 });
    }
    const identity = await this.adoptIdentity(pathIdentity);

    const ticket = url.searchParams.get('ticket') || '';
    // Fail closed: verifying against an empty key would let anyone mint
    // valid HMAC tickets (mirrors the TASK_SECRET refusal in workerCron).
    const ticketSecret = this.env.JWT_SECRET;
    if (!ticketSecret) {
      console.warn('[chat-do] rejecting connection: JWT_SECRET is not set');
      return new Response('Realtime auth unavailable', { status: 503 });
    }
    const expectedRoomId =
      identity.kind === 'room' && identity.roomId !== undefined
        ? identity.roomId
        : null;
    const verified = await verifyRealtimeTicket(ticketSecret, ticket, {
      expectedRoomId,
      expectedUserId: identity.kind === 'user' ? identity.userId : undefined,
    });
    if (!verified.ok) {
      console.warn(
        `[chat-do] rejecting connection: ${verified.reason} (${identity.kind})`,
      );
      return new Response(`Invalid ticket: ${verified.reason}`, {
        status: 401,
      });
    }

    const pair = ChatRoomDO.createWebSocketPair();
    const { userId } = verified;
    this.ctx.acceptWebSocket(pair.server, [`uid:${userId}`]);
    pair.server.serializeAttachment(
      serializeConnectionMeta({ userId, connectedAt: Date.now() }),
    );
    this.ensureMembership().add(pair.server, userId);

    pair.server.send(
      buildServerFrame(
        'hello',
        identity.kind === 'room' ? { roomId: identity.roomId } : { userId },
      ),
    );
    return new Response(null, {
      status: 101,
      webSocket: pair.client,
    } as ResponseInit);
  }

  /** Internal endpoint: room DOs push badge events into user mailboxes. */
  private async handleNotify(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    const identity = await this.loadIdentity();
    if (!identity || identity.kind !== 'user') {
      // A mailbox that has never served a connection has no persisted
      // identity; there is nothing connected to deliver to either.
      return new Response('Not found', { status: 404 });
    }
    let body: { event?: unknown; payload?: unknown };
    try {
      body = (await request.json()) as { event?: unknown; payload?: unknown };
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
    if (
      typeof body.event !== 'string' ||
      !(USER_MAILBOX_NOTIFY_EVENTS as readonly string[]).includes(body.event)
    ) {
      return new Response('Unsupported event', { status: 400 });
    }
    const delivered = broadcastFrame(
      this.ensureMembership().allSockets(),
      body.event,
      body.payload,
    );
    return Response.json({ delivered });
  }

  // -----------------------------------------------------------------
  // Hibernation handlers
  // -----------------------------------------------------------------

  async webSocketMessage(
    ws: HibernatingSocketLike,
    message: unknown,
  ): Promise<void> {
    // A restarted/hibernation-evicted instance must recover its identity from
    // storage before handling frames (loadIdentity is in-memory after first).
    await this.loadIdentity();
    const membership = this.ensureMembership();
    const userId = this.socketUserIdOf(ws);
    if (userId === null) {
      // Unknown socket (unreadable attachment): refuse and drop it.
      this.closeQuietly(ws, 1011, 'unknown connection');
      return;
    }
    const connectionKey = this.connectionKeyOf(ws);

    if (
      typeof message === 'string' &&
      message.length > MAX_INBOUND_FRAME_BYTES
    ) {
      // Character-length pre-check; parseInboundFrame enforces the byte cap.
      this.closeQuietly(ws, 1009, 'frame too large');
      return;
    }
    if (!this.inboundFrameLimiter.tryAcquire(connectionKey)) {
      this.closeQuietly(ws, 1008, 'rate limit');
      return;
    }

    const parsed = parseInboundFrame(message);
    if (!parsed.ok) {
      if (parsed.reason === 'too-large') {
        this.closeQuietly(ws, 1009, 'frame too large');
        return;
      }
      this.rejectSend(ws, parsed, 'Invalid message data', 'REJECTED');
      return;
    }

    try {
      if (parsed.frame.type === 'sendMessage') {
        await this.handleInboundSend(ws, userId, parsed.frame, membership);
      } else {
        await this.handleInboundMarkAsRead(userId, parsed.frame, membership);
      }
    } catch (error: unknown) {
      console.error('[chat-do] failed to handle inbound frame', error);
      if (parsed.frame.type === 'sendMessage') {
        this.rejectSend(
          ws,
          parsed.frame,
          'Failed to send message.',
          'REJECTED',
        );
      }
    }
  }

  async webSocketClose(
    ws: HibernatingSocketLike,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    this.ensureMembership().remove(ws);
  }

  async webSocketError(
    ws: HibernatingSocketLike,
    error: unknown,
  ): Promise<void> {
    console.error('[chat-do] websocket error', error);
    this.ensureMembership().remove(ws);
    this.closeQuietly(ws, 1011, 'error');
  }

  // -----------------------------------------------------------------
  // Frame handlers (persist through the internal endpoints, then fan out)
  // -----------------------------------------------------------------

  /** messageError plus, for acknowledged sends, the failed acknowledgement. */
  private rejectSend(
    ws: HibernatingSocketLike,
    source: { tempId?: number; clientMessageId?: string },
    error: string,
    code: 'RATE_LIMITED' | 'REJECTED',
  ): void {
    ws.send(
      buildServerFrame('messageError', {
        tempId: source.tempId,
        clientMessageId: source.clientMessageId,
        error,
      }),
    );
    if (source.clientMessageId) {
      ws.send(
        buildServerFrame(DO_SEND_ACK_EVENT, {
          clientMessageId: source.clientMessageId,
          ack: { ok: false, error: code },
        }),
      );
    }
  }

  private async handleInboundSend(
    ws: HibernatingSocketLike,
    userId: number,
    frame: Extract<ParsedInboundFrame, { type: 'sendMessage' }>,
    membership: RoomMembershipType,
  ): Promise<void> {
    const identity = this.requireRoomIdentity();
    if (frame.roomId !== identity.roomId) {
      this.rejectSend(ws, frame, 'Invalid message data', 'REJECTED');
      return;
    }

    // Early per-connection bound; the authoritative per-user 10/10 s limit is
    // the Postgres limiter behind /api/realtime/send.
    if (!this.sendMessageLimiter.tryAcquire(this.connectionKeyOf(ws))) {
      this.rejectSend(
        ws,
        frame,
        'You are sending messages too quickly.',
        'RATE_LIMITED',
      );
      return;
    }

    // Service-binding fetch must be invoked as a method — workerd bindings
    // are exotic objects whose fetch throws "Illegal invocation" when called
    // detached (this-binding checked by ChatRoomDO.test.ts's fakes).
    const selfService = this.env.WORKER_SELF_REFERENCE;
    if (!selfService?.fetch || !this.env.TASK_SECRET) {
      this.rejectSend(ws, frame, 'Realtime is not available.', 'REJECTED');
      return;
    }

    let response: Response;
    try {
      response = await selfService.fetch(SEND_ENDPOINT_URL, {
        method: 'POST',
        headers: {
          // Raw secret, no Bearer prefix — the cron endpoints' contract.
          authorization: this.env.TASK_SECRET,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          roomId: frame.roomId,
          content: frame.content,
          richContent: frame.richContent,
          clientMessageId: frame.clientMessageId,
          tempId: frame.tempId,
          replyToMessageId: frame.replyToMessageId,
          messageType: frame.messageType,
          sharedAttackLogId: frame.sharedAttackLogId,
        }),
      });
    } catch (error: unknown) {
      console.error('[chat-do] send endpoint fetch threw', error);
      this.rejectSend(ws, frame, 'Failed to send message.', 'REJECTED');
      return;
    }

    if (!response.ok) {
      let errorText = 'Failed to send message.';
      if (response.status === 429) {
        errorText = 'You are sending messages too quickly.';
      } else {
        try {
          const body = (await response.json()) as RealtimeEndpointError;
          if (body && typeof body.error === 'string' && body.error) {
            errorText = body.error;
          }
        } catch {
          // non-JSON error body: keep the generic message
        }
      }
      this.rejectSend(
        ws,
        frame,
        errorText,
        response.status === 429 ? 'RATE_LIMITED' : 'REJECTED',
      );
      return;
    }

    const result = (await response.json()) as SendEndpointSuccess;
    // Acknowledge durable storage to the sender before any fan-out, exactly
    // like the Socket.IO path (src/lib/socket.ts handleSendMessage).
    if (frame.clientMessageId) {
      ws.send(
        buildServerFrame(DO_SEND_ACK_EVENT, {
          clientMessageId: frame.clientMessageId,
          ack: { ok: true, message: result.message },
        }),
      );
    }
    const receivePayload = { ...result.message, tempId: result.tempId };
    if (result.deduplicated) {
      // A retry of an already-stored send: the room saw it the first time.
      ws.send(buildServerFrame('receiveMessage', receivePayload));
      return;
    }
    broadcastFrame(membership.allSockets(), 'receiveMessage', receivePayload);

    this.evictStaleMembers(membership, result.participantUserIds);

    if (result.notification) {
      await this.notifyMailboxes(
        result.participantUserIds.filter((id) => id !== userId),
        'newMessageNotification',
        result.notification,
      );
    }
  }

  private async handleInboundMarkAsRead(
    userId: number,
    frame: Extract<ParsedInboundFrame, { type: 'markAsRead' }>,
    membership: RoomMembershipType,
  ): Promise<void> {
    const identity = this.requireRoomIdentity();
    if (frame.roomId !== identity.roomId) return;

    // Same this-binding requirement as the send path above.
    const selfService = this.env.WORKER_SELF_REFERENCE;
    if (!selfService?.fetch || !this.env.TASK_SECRET) return;

    let response: Response;
    try {
      response = await selfService.fetch(READ_ENDPOINT_URL, {
        method: 'POST',
        headers: {
          authorization: this.env.TASK_SECRET,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          roomId: frame.roomId,
          messageIds: frame.messageIds,
        }),
      });
    } catch (error: unknown) {
      // Parity with the Socket.IO handler: markAsRead failures are logged only.
      console.error('[chat-do] read endpoint fetch threw', error);
      return;
    }
    if (!response.ok) {
      console.error(`[chat-do] read endpoint returned ${response.status}`);
      return;
    }

    const result = (await response.json()) as ReadEndpointSuccess;
    if (result.updates.length > 0) {
      broadcastFrame(membership.allSockets(), 'messagesRead', {
        roomId: result.roomId,
        updates: result.updates,
      });
    }
    this.evictStaleMembers(membership, result.participantUserIds);
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  /** Pushes an event into the mailbox DO of every listed user. */
  private async notifyMailboxes(
    userIds: readonly number[],
    event: string,
    payload: unknown,
  ): Promise<void> {
    const namespace = this.env.CHAT_ROOM_DO;
    if (!namespace) return;
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const stub = namespace.get(namespace.idFromName(`user:${userId}`));
          await stub.fetch(USER_MAILBOX_NOTIFY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ event, payload }),
          });
        } catch (error: unknown) {
          console.error(
            `[chat-do] mailbox notify failed for user ${userId}`,
            error,
          );
        }
      }),
    );
  }

  /** Closes sockets of users no longer in the participant list (lazy eviction). */
  private evictStaleMembers(
    membership: RoomMembershipType,
    participantUserIds: readonly number[],
  ): void {
    for (const userId of planEvictions(membership, participantUserIds)) {
      console.warn(`[chat-do] evicting non-participant user ${userId}`);
      for (const socket of membership.socketsOf(userId)) {
        this.closeQuietly(socket, 1008, 'no longer a participant');
        membership.remove(socket);
      }
    }
  }

  /** The attachment is the hibernation-safe source of truth for identity. */
  private socketUserIdOf(ws: HibernatingSocketLike): number | null {
    return (
      deserializeConnectionMeta(ws.deserializeAttachment())?.userId ?? null
    );
  }

  private connectionKeyOf(ws: HibernatingSocketLike): string {
    let key = this.connectionKeys.get(ws as unknown as object);
    if (!key) {
      this.nextConnectionSeq += 1;
      key = `conn:${this.nextConnectionSeq}`;
      this.connectionKeys.set(ws as unknown as object, key);
    }
    return key;
  }

  private closeQuietly(
    ws: HibernatingSocketLike,
    code: number,
    reason: string,
  ): void {
    try {
      ws.close(code, reason);
    } catch {
      // already closing
    }
  }

  /** Returns the persisted identity, loading it from storage once. */
  private async loadIdentity(): Promise<DoIdentity | null> {
    if (this.identity) return this.identity;
    if (!this.identityLoaded) {
      this.identity =
        (await this.ctx.storage.get<DoIdentity>(IDENTITY_STORAGE_KEY)) ?? null;
      this.identityLoaded = true;
    }
    return this.identity;
  }

  /** Adopts (and persists on first sight) the identity implied by the path. */
  private async adoptIdentity(fromPath: DoIdentity): Promise<DoIdentity> {
    const stored = await this.loadIdentity();
    if (!stored) {
      await this.ctx.storage.put(IDENTITY_STORAGE_KEY, fromPath);
      this.identity = fromPath;
      return fromPath;
    }
    // idFromName routing guarantees this; assert to catch wiring regressions.
    if (
      stored.kind !== fromPath.kind ||
      stored.roomId !== fromPath.roomId ||
      stored.userId !== fromPath.userId
    ) {
      console.error('[chat-do] identity mismatch', stored, fromPath);
      throw new Error('DO identity mismatch');
    }
    return stored;
  }

  private parseIdentityFromPath(pathname: string): DoIdentity | null {
    const chatMatch = /^\/do\/chat\/(\d+)\/?$/.exec(pathname);
    if (chatMatch) {
      const roomId = Number(chatMatch[1]);
      return Number.isSafeInteger(roomId) && roomId > 0
        ? { kind: 'room', roomId }
        : null;
    }
    const userMatch = /^\/do\/user\/(\d+)\/?$/.exec(pathname);
    if (userMatch) {
      const userId = Number(userMatch[1]);
      return Number.isSafeInteger(userId) && userId > 0
        ? { kind: 'user', userId }
        : null;
    }
    return null;
  }

  private requireRoomIdentity(): { roomId: number } {
    const { identity } = this;
    if (!identity || identity.kind !== 'room' || !identity.roomId) {
      throw new Error('room identity missing');
    }
    return { roomId: identity.roomId };
  }

  /** Membership index, rebuilt from live sockets when missing (post-wake). */
  private ensureMembership(): RoomMembershipType {
    if (!this.membership) {
      this.membership = RoomMembership.fromSockets(this.ctx.getWebSockets());
    }
    return this.membership;
  }
}
