/**
 * Server-side realtime facade.
 *
 * Everything that pushes a socket event imports this module instead of
 * '@/lib/socket', so the Socket.IO server (and its node:http dependency) is
 * only ever loaded through a lazy dynamic import. Setting
 * NEXT_PUBLIC_DISABLE_SOCKET to 'true' or '1' turns realtime off entirely:
 * every function below becomes a no-op and the Socket.IO module is never
 * imported, which lets the same build run on hosts without websocket support
 * (e.g. Cloudflare Workers).
 *
 * With the Durable Objects pilot transport (NEXT_PUBLIC_REALTIME_TRANSPORT=do)
 * per-user events go to the user's mailbox DO instead, through the
 * CHAT_ROOM_DO binding OpenNext exposes per request. The mailbox only accepts
 * USER_MAILBOX_NOTIFY_EVENTS; other per-user events stay no-ops there.
 *
 * Contract: none of these functions ever throw — failures are logged and
 * swallowed, because emitting a notification must never break the API request
 * that triggered it.
 */

import {
  resolveRealtimeTransport,
  USER_MAILBOX_NOTIFY_EVENTS,
  USER_MAILBOX_NOTIFY_URL,
} from '@/lib/realtimeTransport';
import { logError } from '@/utils/logger';

type SocketModule = typeof import('@/lib/socket');

/**
 * Structural CHAT_ROOM_DO binding. Declared here rather than imported from the
 * DO modules, which are written for strict mode and stay out of the app's
 * non-strict tsconfig graph.
 */
type ChatDoNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(input: string, init?: RequestInit): Promise<Response>;
  };
};

// The mailbox DO accepts exactly these names and refuses anything else with
// 400, so other events (blogPostNotification) are skipped here.
const MAILBOX_EVENTS: ReadonlySet<string> = new Set(USER_MAILBOX_NOTIFY_EVENTS);

let socketModule: SocketModule | null = null;
let socketModulePromise: Promise<SocketModule | null> | null = null;

const isDisabledFlag = (value: string | undefined): boolean =>
  value === 'true' || value === '1';

/** Whether realtime (Socket.IO) is enabled for this runtime. */
export const isRealtimeEnabled = (): boolean =>
  !isDisabledFlag(process.env.NEXT_PUBLIC_DISABLE_SOCKET);

const isDoTransport = (): boolean =>
  resolveRealtimeTransport(
    process.env.NEXT_PUBLIC_REALTIME_TRANSPORT,
    process.env.NEXT_PUBLIC_DISABLE_SOCKET,
  ) === 'do';

/** Whether per-user pushes reach anyone (Socket.IO or the DO mailboxes). */
export const isUserPushEnabled = (): boolean =>
  isDoTransport() || isRealtimeEnabled();

// Test-only override for the binding; undefined means "ask OpenNext".
let chatDoNamespaceOverride: ChatDoNamespace | null | undefined;

/** The CHAT_ROOM_DO binding of the current Workers request, or null elsewhere. */
const resolveChatDoNamespace = async (): Promise<ChatDoNamespace | null> => {
  if (chatDoNamespaceOverride !== undefined) return chatDoNamespaceOverride;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = getCloudflareContext({ async: false });
    return (env as { CHAT_ROOM_DO?: ChatDoNamespace }).CHAT_ROOM_DO ?? null;
  } catch {
    return null;
  }
};

/** Pushes a mailbox event to each user's DO. Never throws. */
const notifyUserMailboxes = async (
  userIds: Array<number>,
  event: string,
  payload: unknown,
): Promise<void> => {
  if (!MAILBOX_EVENTS.has(event)) return;
  const namespace = await resolveChatDoNamespace();
  if (!namespace) return;
  const body = JSON.stringify({ event, payload });
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const stub = namespace.get(namespace.idFromName(`user:${userId}`));
        const response = await stub.fetch(USER_MAILBOX_NOTIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        // 404: the user has never opened a mailbox socket, so nobody listens.
        if (!response.ok && response.status !== 404) {
          logError(`Mailbox rejected '${event}' for user ${userId}`, {
            status: response.status,
          });
        }
      } catch (error) {
        logError(`Failed to push '${event}' to mailbox of user ${userId}`, {
          error,
        });
      }
    }),
  );
};

/** Lazily resolves the socket module once; concurrent callers share the load. */
const loadSocketModule = (): Promise<SocketModule | null> => {
  if (socketModule) return Promise.resolve(socketModule);
  if (!socketModulePromise) {
    socketModulePromise = import('@/lib/socket')
      .then((mod) => {
        socketModule = mod;
        return mod;
      })
      .catch((error: unknown) => {
        // Drop the cached promise so a later call can retry the import.
        socketModulePromise = null;
        logError('Failed to load the Socket.IO module', error);
        return null;
      });
  }
  return socketModulePromise;
};

/** Emits `event` to every socket in `room`. Never throws. */
export const emitToRoom = async (
  room: string,
  event: string,
  payload: unknown,
): Promise<void> => {
  if (!isRealtimeEnabled()) return;
  try {
    const mod = await loadSocketModule();
    // An uninitialized server (tests, scripts, disabled runtime) matches the
    // old `getSocketIO()?.…` behavior: skip silently.
    mod?.getSocketIO()?.to(room).emit(event, payload);
  } catch (error) {
    logError(`Failed to emit '${event}' to room '${room}'`, error);
  }
};

/** Emits `event` to the personal room of a single user (`user-<id>`). */
export const emitToUser = async (
  userId: number,
  event: string,
  payload: unknown,
): Promise<void> => emitToUsers([userId], event, payload);

/** Emits `event` to the personal rooms of several users. */
export const emitToUsers = async (
  userIds: Array<number>,
  event: string,
  payload: unknown,
): Promise<void> => {
  if (isDoTransport()) {
    await notifyUserMailboxes(userIds, event, payload);
    return;
  }
  await Promise.all(
    userIds.map((userId) => emitToRoom(`user-${userId}`, event, payload)),
  );
};

/** Broadcasts `event` to every connected socket. Never throws. */
export const emitToAll = async (
  event: string,
  payload: unknown,
): Promise<void> => {
  if (!isRealtimeEnabled()) return;
  try {
    const mod = await loadSocketModule();
    mod?.getSocketIO()?.emit(event, payload);
  } catch (error) {
    logError(`Failed to broadcast '${event}'`, error);
  }
};

/** Removes every socket of a user from a chat room channel. Never throws. */
export const evictUserFromChatRoom = async (
  userId: number,
  roomId: number,
): Promise<void> => {
  if (!isRealtimeEnabled()) return;
  try {
    const mod = await loadSocketModule();
    mod?.evictUserFromChatRoom(userId, roomId);
  } catch (error) {
    logError('Failed to remove user sockets from chat room', {
      userId,
      roomId,
      error,
    });
  }
};

/** Removes a former alliance member's sockets from that alliance's rooms. */
export const evictUserFromAllianceChatRooms = async (
  userId: number,
  allianceId: number,
): Promise<void> => {
  if (!isRealtimeEnabled()) return;
  try {
    const mod = await loadSocketModule();
    await mod?.evictUserFromAllianceChatRooms(userId, allianceId);
  } catch (error) {
    logError('Failed to remove user sockets from alliance chat rooms', {
      userId,
      allianceId,
      error,
    });
  }
};

/**
 * Test-only: drops the cached Socket.IO module handle. Bun module mocks are
 * process-wide, so suites that mock '@/lib/socket' (or run before one that
 * does) must reset this cache to keep the lazily-resolved module from leaking
 * across test files — the same isolation pattern used for logger and service
 * mocks.
 */
export const __resetRealtimeModuleCacheForTests = (): void => {
  socketModule = null;
  socketModulePromise = null;
};

/**
 * Test-only: stands in for the CHAT_ROOM_DO binding (null = no binding,
 * undefined = resolve through OpenNext again). Avoids a process-wide module
 * mock of '@opennextjs/cloudflare', which other suites also mock.
 */
export const __setChatDoNamespaceForTests = (
  namespace: ChatDoNamespace | null | undefined,
): void => {
  chatDoNamespaceOverride = namespace;
};
