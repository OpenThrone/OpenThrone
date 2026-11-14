/**
 * Realtime transport selection for the messaging client (#23 part 3).
 *
 * NEXT_PUBLIC_REALTIME_TRANSPORT picks the transport:
 * - `socketio` (default) — exactly today's Socket.IO behavior;
 * - `do` — the Durable Objects pilot: native WebSockets to /do/chat/<room>
 *   and /do/user/<id> with a signed ticket from /api/realtime/ticket;
 * - `off` — realtime fully disabled, identical semantics to the legacy
 *   NEXT_PUBLIC_DISABLE_SOCKET kill switch.
 *
 * Precedence: an explicit `do` wins (the pilot path does not touch Socket.IO
 * at all, so it may run where the Node socket server cannot); otherwise the
 * legacy kill switch wins — `off` when NEXT_PUBLIC_DISABLE_SOCKET is true/1,
 * else `socketio`. That keeps every existing deployment byte-identical until
 * someone opts into the pilot.
 *
 * Why not the RUNTIME_SETTING_REGISTRY (`src/constants/runtimeSettings.ts`):
 * that registry is the DB-backed admin feature-flag surface
 * (`src/services/RuntimeConfig.service.ts`), while realtime transport is a
 * NEXT_PUBLIC_* build-time constant inlined by `next build`
 * (docs/operations.md: "Build-time values ... must be present in the build
 * environment") — the same class of flag as NEXT_PUBLIC_DISABLE_SOCKET, which
 * has never lived in the registry. This module is that flag's single source
 * of truth.
 *
 * Pure and isomorphic on purpose: imported by the React hook, by tests, and
 * by scripts/loadtest-chat.ts for the URL/protocol constants.
 */

export type RealtimeTransport = 'socketio' | 'do' | 'off';

const isDisabledFlag = (value: string | undefined): boolean =>
  value === 'true' || value === '1';

/**
 * Resolves the effective transport from the two build-time flags. Both
 * undefined → 'socketio' (today's default). See module doc for precedence.
 */
export const resolveRealtimeTransport = (
  transportFlag: string | undefined,
  disableFlag: string | undefined,
): RealtimeTransport => {
  const normalized = (transportFlag ?? '').trim().toLowerCase();
  const disabled = isDisabledFlag((disableFlag ?? '').trim().toLowerCase());
  if (normalized === 'do') return 'do';
  if (normalized === 'off' || disabled) return 'off';
  return 'socketio';
};

// ---------------------------------------------------------------------------
// Durable Object wire protocol (client side)
// ---------------------------------------------------------------------------

/** Route prefixes; must match src/lib/workerDoRouter.ts. */
export const DO_CHAT_ROUTE_PREFIX = '/do/chat';
export const DO_USER_ROUTE_PREFIX = '/do/user';

/** Internal endpoint host (any host works over a binding or service binding). */
export const DO_INTERNAL_ORIGIN = 'https://do.openthrone.internal';

/**
 * Events a user-mailbox DO accepts on its internal /notify endpoint: the
 * per-user pushes the server sends one player (new messages, attack and spy
 * alerts, gold and friend notices, the social badge count). Socket.IO sends
 * the same names to the player's `user-<id>` room. Each one has a client
 * listener (src/hooks/useGameEventAlerts.ts, the social badge, messaging).
 */
export const USER_MAILBOX_NOTIFY_EVENTS = [
  'newMessageNotification',
  'attackNotification',
  'spyDefenseNotification',
  'goldTransferReceived',
  'friendRequestNotification',
  'goldRequestNotification',
  'socialCountUpdate',
] as const;

/** Mailbox endpoint that room DOs and the Next handler push badge events to. */
export const USER_MAILBOX_NOTIFY_URL = `${DO_INTERNAL_ORIGIN}/notify`;

/** Ticket endpoint; must match src/pages/api/realtime/ticket.ts. */
export const REALTIME_TICKET_ENDPOINT = '/api/realtime/ticket';

/** Client → DO frame (see src/durable-objects/chatDoCore.ts). */
export type DoClientFrame =
  | {
      type: 'sendMessage';
      roomId: number;
      content: string;
      richContent?: unknown;
      clientMessageId?: string;
      tempId?: number;
      replyToMessageId?: number;
      messageType?: string;
      sharedAttackLogId?: number;
    }
  | { type: 'markAsRead'; roomId: number; messageIds: number[] };

/** DO → client frame envelope. */
export interface DoServerFrame {
  event: string;
  payload: unknown;
}

/** Builds the websocket URL for a room channel, converting http(s) → ws(s). */
export const buildDoChatUrl = (
  origin: string,
  roomId: number,
  ticket: string,
): string =>
  `${toWsOrigin(origin)}${DO_CHAT_ROUTE_PREFIX}/${roomId}?ticket=${encodeURIComponent(ticket)}`;

/** Builds the websocket URL for the personal mailbox channel. */
export const buildDoUserUrl = (
  origin: string,
  userId: number,
  ticket: string,
): string =>
  `${toWsOrigin(origin)}${DO_USER_ROUTE_PREFIX}/${userId}?ticket=${encodeURIComponent(ticket)}`;

const toWsOrigin = (origin: string): string =>
  origin.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');

// ---------------------------------------------------------------------------
// Socket-like surface shared by both transports
// ---------------------------------------------------------------------------

/**
 * The subset of the Socket.IO client surface the messaging UI actually uses
 * (`emit` from room joins and reactions, `timeout().emit` for acknowledged
 * sends, `on`/`off` for per-hook listeners such as typing, `connect` from
 * the connection banner's retry, `id` in log lines). A socket.io-client
 * `Socket` satisfies this structurally; the DO transport provides a shim
 * with the same shape so consumers stay transport-agnostic.
 */
export type RealtimeAck = (error: Error | null, result: any) => void;

export interface RealtimeClientSocket {
  readonly id: string;
  emit(event: string, payload?: unknown): void;
  timeout(ms: number): {
    emit(event: string, payload: unknown, ack: RealtimeAck): void;
  };
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  connect(): void;
}

/**
 * DO → client frame acknowledging one send, keyed by the client's
 * clientMessageId; payload is `{ clientMessageId, ack }` where `ack` is a
 * ChatSendAcknowledgement (`src/types/chat.ts`), matching the Socket.IO
 * `sendMessage` acknowledgement callback.
 */
export const DO_SEND_ACK_EVENT = 'sendMessageAck';
