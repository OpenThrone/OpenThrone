/**
 * Browser-side transport for the Durable Objects realtime pilot (#23 part 3).
 *
 * Owns the two pilot websockets — the personal mailbox (`/do/user/<id>`, the
 * `newMessageNotification` badge channel) and the currently open room
 * (`/do/chat/<roomId>`) — and feeds every received frame into the SAME
 * listener registry the Socket.IO path uses, so `/messaging`, the unread
 * badge (`src/context/users.tsx`) and the themed chat components work
 * unchanged. The `emit` surface mirrors the events the UI already emits
 * (`sendMessage`, `markAsRead`, `joinRoom`, `leaveRoom`, `registerUser`);
 * `emitWithAck` backs the Socket.IO `timeout().emit(..., ack)` surface the
 * chat outbox uses for sends, resolved by the DO's `sendMessageAck` frame.
 * Events outside the pilot scope (reactions, typing) are dropped with a log
 * line — see docs/realtime-pilot.md §7 for the scope decision.
 *
 * Failure behavior: on unrecoverable connection failure the transport gives
 * up, reports `connectionFailed`, and stops delivering events — the page is
 * then exactly the HTTP read-only mode (messages/rooms still load over HTTP;
 * sends no-op because `isConnected` is false), with the existing
 * ConnectionStatusBanner offering a manual retry.
 *
 * All I/O is injectable (`fetchTicket`, `openWebSocket`, timers, origin) so
 * `realtimeDoClient.test.ts` drives reconnects and frame routing with fakes.
 * Reconnect cadence mirrors the Socket.IO client defaults
 * (`src/hooks/useSocket.ts:7-9`): 5 attempts, 1 s doubling to a 30 s cap; a
 * successful reconnect re-joins the open room, closing the Socket.IO
 * reconnect gap documented in docs/realtime-pilot.md §3.
 */

import {
  buildDoChatUrl,
  buildDoUserUrl,
  DO_SEND_ACK_EVENT,
  type DoServerFrame,
  REALTIME_TICKET_ENDPOINT,
  type RealtimeAck,
} from '@/lib/realtimeTransport';
import { logError, logInfo } from '@/utils/logger';

/** Structural slice of the native WebSocket the transport uses. */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
}

export interface ChatDoTransportCallbacks {
  /** Dispatches a realtime event into the shared listener registry. */
  dispatch(event: string, payload: unknown): void;
  onConnectionChange(connected: boolean): void;
  onConnectionFailed(failed: boolean): void;
}

export interface ChatDoTransportDeps {
  /** Fetches a signed ticket for the given room (null = personal channel). */
  fetchTicket(roomScope: number | null): Promise<string>;
  openWebSocket(url: string): WebSocketLike;
  origin(): string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;
const RECONNECT_DELAY_MAX_MS = 30000;

const reconnectDelay = (attempt: number): number =>
  Math.min(
    RECONNECT_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    RECONNECT_DELAY_MAX_MS,
  );

interface ManagedSocket {
  socket: WebSocketLike;
  /** Intentional closes must not trigger reconnect logic. */
  intentional: boolean;
  label: string;
}

export interface ChatDoTransport {
  emit(event: string, payload?: unknown): void;
  /**
   * Socket.IO `timeout(ms).emit(event, payload, ack)` parity: `ack(null,
   * result)` on the server acknowledgement, `ack(Error)` on timeout, a
   * dropped frame, or teardown. Only `sendMessage` with a clientMessageId
   * is acknowledged; anything else fails immediately.
   */
  emitWithAck(
    event: string,
    payload: unknown,
    timeoutMs: number,
    ack: RealtimeAck,
  ): void;
  retry(): void;
  stop(): void;
}

export const createChatDoTransport = (
  callbacks: ChatDoTransportCallbacks,
  deps: Partial<ChatDoTransportDeps> = {},
): ChatDoTransport => {
  let userId: number | null = null;
  let userSocket: ManagedSocket | null = null;
  let roomSocket: ManagedSocket | null = null;
  let currentRoomId: number | null = null;
  let userAttempts = 0;
  let roomAttempts = 0;
  // One handle per channel: a shared slot let the second scheduler destroy
  // the first channel's pending reconnect after a both-channels drop.
  let userReconnectTimer: unknown = null;
  let roomReconnectTimer: unknown = null;
  let stopped = false;
  const pendingAcks = new Map<string, { ack: RealtimeAck; timer: unknown }>();

  const defaultDeps: ChatDoTransportDeps = {
    fetchTicket: async (roomScope) => {
      const response = await fetch(REALTIME_TICKET_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(roomScope === null ? {} : { roomId: roomScope }),
      });
      if (!response.ok) {
        throw new Error(`Ticket request failed with status ${response.status}`);
      }
      const body = (await response.json()) as { ticket?: string };
      if (!body.ticket) {
        throw new Error('Ticket response contained no ticket');
      }
      return body.ticket;
    },
    openWebSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
    origin: () =>
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000',
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const io: ChatDoTransportDeps = { ...defaultDeps, ...deps };

  const clearUserReconnectTimer = (): void => {
    if (userReconnectTimer !== null) {
      io.clearTimer(userReconnectTimer);
      userReconnectTimer = null;
    }
  };

  const clearRoomReconnectTimer = (): void => {
    if (roomReconnectTimer !== null) {
      io.clearTimer(roomReconnectTimer);
      roomReconnectTimer = null;
    }
  };

  const closeSocket = (managed: ManagedSocket | null): void => {
    if (!managed) return;
    managed.intentional = true;
    try {
      managed.socket.close(1000, 'client close');
    } catch (error: unknown) {
      logError('Failed to close DO websocket', error);
    }
  };

  const settleAck = (
    clientMessageId: string,
    error: Error | null,
    result?: unknown,
  ): void => {
    const pending = pendingAcks.get(clientMessageId);
    if (!pending) return;
    pendingAcks.delete(clientMessageId);
    io.clearTimer(pending.timer);
    pending.ack(error, result);
  };

  const handleServerFrame = (raw: unknown, label: string): void => {
    let frame: DoServerFrame;
    try {
      const parsed = JSON.parse(String(raw)) as DoServerFrame;
      if (typeof parsed.event !== 'string') throw new Error('missing event');
      frame = parsed;
    } catch (error: unknown) {
      logError(`Invalid frame on ${label} websocket`, { raw, error });
      return;
    }
    if (frame.event === DO_SEND_ACK_EVENT) {
      const payload = frame.payload as
        | { clientMessageId?: unknown; ack?: unknown }
        | undefined;
      if (typeof payload?.clientMessageId === 'string') {
        settleAck(payload.clientMessageId, null, payload.ack);
      }
      return;
    }
    callbacks.dispatch(frame.event, frame.payload);
  };

  const openUserSocket = async (): Promise<void> => {
    if (stopped || userId === null || userSocket) return;
    const ticket = await io.fetchTicket(null);
    if (stopped || userId === null || userSocket) return;

    const socket = io.openWebSocket(
      buildDoUserUrl(io.origin(), userId, ticket),
    );
    const managed: ManagedSocket = {
      socket,
      intentional: false,
      label: 'user',
    };
    userSocket = managed;

    socket.onopen = () => {
      if (userSocket !== managed) return;
      userAttempts = 0;
      callbacks.onConnectionFailed(false);
      callbacks.onConnectionChange(true);
      // Re-join the open room after a reconnect (the gap Socket.IO leaves).
      if (currentRoomId !== null && !roomSocket) {
        roomAttempts = 0;
        openRoomSocket(currentRoomId).catch((error: unknown) => {
          logError('Failed to re-join room after reconnect', error);
        });
      }
    };
    socket.onmessage = (event) => {
      if (userSocket !== managed) return;
      handleServerFrame(event.data, 'user');
    };
    socket.onclose = () => {
      if (userSocket !== managed) return;
      userSocket = null;
      callbacks.onConnectionChange(false);
      if (managed.intentional || stopped) return;
      scheduleUserReconnect();
    };
    socket.onerror = () => {
      logError('User mailbox websocket error');
    };
  };

  const scheduleUserReconnect = (): void => {
    userAttempts += 1;
    if (userAttempts > RECONNECT_ATTEMPTS) {
      logError('DO realtime reconnect failed; giving up');
      callbacks.onConnectionFailed(true);
      return;
    }
    clearUserReconnectTimer();
    userReconnectTimer = io.setTimer(() => {
      openUserSocket().catch((error: unknown) => {
        logError('DO realtime reconnect attempt failed', error);
        if (userSocket === null) {
          scheduleUserReconnect();
        }
      });
    }, reconnectDelay(userAttempts));
  };

  const openRoomSocket = async (roomId: number): Promise<void> => {
    if (stopped || userId === null) return;
    const ticket = await io.fetchTicket(roomId);
    if (stopped) return;

    // A newer join/leave may have raced the ticket fetch.
    if (currentRoomId !== roomId) return;

    closeSocket(roomSocket);
    roomSocket = null;

    const socket = io.openWebSocket(
      buildDoChatUrl(io.origin(), roomId, ticket),
    );
    const managed: ManagedSocket = {
      socket,
      intentional: false,
      label: `room-${roomId}`,
    };
    roomSocket = managed;

    socket.onopen = () => {
      if (roomSocket !== managed) return;
      roomAttempts = 0;
      logInfo(`DO room websocket open: room-${roomId}`);
    };
    socket.onmessage = (event) => {
      if (roomSocket !== managed) return;
      handleServerFrame(event.data, `room-${roomId}`);
    };
    socket.onclose = () => {
      if (roomSocket !== managed) return;
      roomSocket = null;
      if (managed.intentional || stopped || currentRoomId !== roomId) return;
      scheduleRoomReconnect(roomId);
    };
    socket.onerror = () => {
      logError(`Room websocket error: room-${roomId}`);
    };
  };

  const scheduleRoomReconnect = (roomId: number): void => {
    roomAttempts += 1;
    if (roomAttempts > RECONNECT_ATTEMPTS) {
      logError(`DO room-${roomId} reconnect failed; giving up`);
      return;
    }
    clearRoomReconnectTimer();
    roomReconnectTimer = io.setTimer(() => {
      openRoomSocket(roomId).catch((error: unknown) => {
        logError(`DO room-${roomId} reconnect attempt failed`, error);
        if (roomSocket === null && currentRoomId === roomId) {
          scheduleRoomReconnect(roomId);
        }
      });
    }, reconnectDelay(roomAttempts));
  };

  /** Returns false when the frame could not be handed to a room socket. */
  const sendFrame = (frame: unknown): boolean => {
    if (!roomSocket) {
      logInfo('DO transport has no room socket; dropping frame', frame);
      return false;
    }
    try {
      roomSocket.socket.send(JSON.stringify(frame));
      return true;
    } catch (error: unknown) {
      logError('Failed to send DO frame', { frame, error });
      return false;
    }
  };

  /** Validated `sendMessage` frame, or null when the payload is unusable. */
  const buildSendFrame = (payload: unknown) => {
    const data = payload as
      | {
          roomId?: number;
          content?: string;
          richContent?: unknown;
          clientMessageId?: string;
          tempId?: number;
          replyToMessageId?: number;
          messageType?: string;
          sharedAttackLogId?: number;
        }
      | undefined;
    if (!data || !data.roomId || !data.content) {
      logInfo('DO transport received invalid sendMessage payload', payload);
      return null;
    }
    return { type: 'sendMessage' as const, ...data };
  };

  return {
    emit(event, payload) {
      if (event === 'registerUser') {
        const requested = Number(
          (payload as { userId?: number } | undefined)?.userId,
        );
        if (requested && userId === null) {
          userId = requested;
          openUserSocket().catch((error: unknown) => {
            logError('Failed to open user mailbox websocket', error);
            callbacks.onConnectionFailed(true);
          });
        }
        return;
      }
      if (event === 'joinRoom') {
        const roomId = Number(payload);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return;
        currentRoomId = roomId;
        roomAttempts = 0;
        openRoomSocket(roomId).catch((error: unknown) => {
          logError(`Failed to join room-${roomId} over DO transport`, error);
        });
        return;
      }
      if (event === 'leaveRoom') {
        const roomId = Number(payload);
        if (currentRoomId === roomId) {
          currentRoomId = null;
          clearRoomReconnectTimer();
          closeSocket(roomSocket);
          roomSocket = null;
        }
        return;
      }
      if (event === 'sendMessage') {
        const frame = buildSendFrame(payload);
        if (frame) sendFrame(frame);
        return;
      }
      if (event === 'markAsRead') {
        const data = payload as
          | {
              roomId?: number;
              messageId?: number;
              messageIds?: number[];
            }
          | undefined;
        if (!data || !data.roomId) return;
        const messageIds =
          'messageIds' in data && Array.isArray(data.messageIds)
            ? data.messageIds
            : data.messageId !== undefined
              ? [data.messageId]
              : [];
        if (messageIds.length === 0) return;
        sendFrame({ type: 'markAsRead', roomId: data.roomId, messageIds });
        return;
      }
      // Out of pilot scope (reactions, room CRUD...): those keep their
      // existing surfaces; see docs/realtime-pilot.md §7.
      logInfo(`DO transport ignoring unsupported event: ${event}`);
    },

    emitWithAck(event, payload, timeoutMs, ack) {
      const frame = event === 'sendMessage' ? buildSendFrame(payload) : null;
      const clientMessageId = frame?.clientMessageId;
      if (!frame || typeof clientMessageId !== 'string' || stopped) {
        ack(new Error(`DO transport cannot acknowledge ${event}`), undefined);
        return;
      }
      // A retry reusing the clientMessageId supersedes the earlier wait.
      settleAck(clientMessageId, new Error('superseded'));
      pendingAcks.set(clientMessageId, {
        ack,
        timer: io.setTimer(
          () => settleAck(clientMessageId, new Error('timeout')),
          timeoutMs,
        ),
      });
      if (!sendFrame(frame)) {
        settleAck(clientMessageId, new Error('no room socket'));
      }
    },

    retry() {
      userAttempts = 0;
      roomAttempts = 0;
      if (userId !== null && !userSocket) {
        openUserSocket().catch((error: unknown) => {
          logError('DO realtime manual retry failed', error);
          callbacks.onConnectionFailed(true);
        });
      }
    },

    stop() {
      stopped = true;
      clearUserReconnectTimer();
      clearRoomReconnectTimer();
      closeSocket(roomSocket);
      roomSocket = null;
      closeSocket(userSocket);
      userSocket = null;
      currentRoomId = null;
      for (const clientMessageId of Array.from(pendingAcks.keys())) {
        settleAck(clientMessageId, new Error('transport stopped'));
      }
      callbacks.onConnectionChange(false);
    },
  };
};
