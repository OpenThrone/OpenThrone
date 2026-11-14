import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type ChatDoTransport,
  createChatDoTransport,
} from '@/lib/realtimeDoClient';
import {
  type RealtimeClientSocket,
  resolveRealtimeTransport,
} from '@/lib/realtimeTransport';
import { logError, logInfo } from '@/utils/logger';

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;
const RECONNECT_DELAY_MAX_MS = 30000;

// NEXT_PUBLIC_* inlines at build time. NEXT_PUBLIC_REALTIME_TRANSPORT selects
// the transport (socketio | do | off, default socketio); the legacy
// NEXT_PUBLIC_DISABLE_SOCKET kill switch still forces 'off' unless the
// explicit 'do' pilot path is chosen. Resolution logic + precedence live in
// one tested place: src/lib/realtimeTransport.ts.
const TRANSPORT = resolveRealtimeTransport(
  process.env.NEXT_PUBLIC_REALTIME_TRANSPORT,
  process.env.NEXT_PUBLIC_DISABLE_SOCKET,
);
const REALTIME_DISABLED = TRANSPORT === 'off';

type SocketIoClientModule = typeof import('socket.io-client');

let socketClientPromise: Promise<SocketIoClientModule> | null = null;

/** Loads socket.io-client only when a connection is actually requested. */
const loadSocketClient = (): Promise<SocketIoClientModule> => {
  if (!socketClientPromise) {
    socketClientPromise = import('socket.io-client');
  }
  return socketClientPromise;
};

let nextClientId = 0;
const desiredUserIds = new Map<number, number | null>();

// Shared client surface: the socket.io Socket in 'socketio' mode, the DO
// transport shim in 'do' mode. Consumers only see RealtimeClientSocket.
let sharedSocket: RealtimeClientSocket | null = null;
let sharedUserId: number | null = null;
let sharedIsConnected = false;
let sharedConnectionFailed = false;
// DO-mode transport handle ('do' mode only).
let doTransport: ChatDoTransport | null = null;

const connectionSubscribers = new Set<(connected: boolean) => void>();
const connectionFailedSubscribers = new Set<(failed: boolean) => void>();
const socketSubscribers = new Set<
  (socket: RealtimeClientSocket | null) => void
>();
const eventListeners: Record<string, Set<Function>> = {};

// Only the latest reconcile attempt may finish creating a socket, so a slow
// dynamic import can never attach a socket for a stale userId.
let reconcileGeneration = 0;

function notifyConnection(connected: boolean) {
  sharedIsConnected = connected;
  connectionSubscribers.forEach((subscriber) => subscriber(connected));
}

function notifyConnectionFailed(failed: boolean) {
  sharedConnectionFailed = failed;
  connectionFailedSubscribers.forEach((subscriber) => subscriber(failed));
}

function notifySocket(socket: RealtimeClientSocket | null) {
  socketSubscribers.forEach((subscriber) => subscriber(socket));
}

function dispatchEvent(event: string, data: any) {
  logInfo(`Dispatching event: ${event}`, data);
  eventListeners[event]?.forEach((listener) => {
    try {
      listener(data);
    } catch (error) {
      logError(`Error in listener for event ${event}:`, error);
    }
  });
}

const connectSocket = async (
  desiredUserId: number,
  generation: number,
): Promise<void> => {
  try {
    const { io } = await loadSocketClient();
    if (generation !== reconcileGeneration) return;

    const socket = io(SERVER_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
    });
    sharedSocket = socket;
    notifySocket(socket);

    logInfo('Connecting to Socket.IO:', SERVER_URL);

    socket.on('connect', () => {
      logInfo('Socket.IO connected');
      notifyConnection(true);
      notifyConnectionFailed(false);
      sharedSocket?.emit('registerUser', { userId: desiredUserId });
    });

    socket.on('disconnect', () => {
      logInfo('Socket.IO disconnected');
      notifyConnection(false);
    });

    socket.on('reconnect', () => {
      logInfo('Socket.IO reconnected, re-registering user and rooms');
      notifyConnection(true);
      notifyConnectionFailed(false);
      sharedSocket?.emit('registerUser', { userId: desiredUserId });
    });

    socket.on('reconnect_attempt', (attempt) => {
      logInfo(`Socket.IO reconnect attempt ${attempt}/${RECONNECT_ATTEMPTS}`);
    });

    socket.on('reconnect_failed', () => {
      logError('Socket.IO reconnect failed; giving up');
      notifyConnection(false);
      notifyConnectionFailed(true);
    });

    socket.onAny((event, data) => {
      dispatchEvent(event, data);
    });
  } catch (error) {
    if (generation !== reconcileGeneration) return;
    logError('Failed to load socket.io-client', error);
    notifyConnection(false);
    notifyConnectionFailed(true);
  }
};

/** Tears down whichever transport owns the shared connection right now. */
function disconnectSharedConnection() {
  if (TRANSPORT === 'do') {
    doTransport?.stop();
    doTransport = null;
  } else if (sharedSocket) {
    (sharedSocket as Socket).disconnect();
  }
  sharedSocket = null;
}

/** 'do' mode: connect the Durable Objects transport for this user. */
const connectDoSocket = (desiredUserId: number): void => {
  const transport = createChatDoTransport({
    dispatch: dispatchEvent,
    onConnectionChange: notifyConnection,
    onConnectionFailed: notifyConnectionFailed,
  });
  doTransport = transport;

  const shim: RealtimeClientSocket = {
    id: `do-transport-${desiredUserId}`,
    emit: (event, payload) => transport.emit(event, payload),
    timeout: (ms) => ({
      emit: (event, payload, ack) =>
        transport.emitWithAck(event, payload, ms, ack),
    }),
    // Per-hook listeners share the registry every DO frame dispatches into.
    on: (event, listener) => {
      (eventListeners[event] ??= new Set()).add(listener);
      return shim;
    },
    off: (event, listener) => {
      eventListeners[event]?.delete(listener);
      return shim;
    },
    connect: () => transport.retry(),
  };
  sharedSocket = shim;
  notifySocket(shim);
  logInfo('Connecting DO realtime transport for user', desiredUserId);
  transport.emit('registerUser', { userId: desiredUserId });
};

function reconcileSocketConnection() {
  const generation = ++reconcileGeneration;

  if (REALTIME_DISABLED) {
    if (sharedSocket) {
      disconnectSharedConnection();
      notifySocket(null);
    }
    sharedUserId = null;
    notifyConnection(false);
    notifyConnectionFailed(false);
    return;
  }

  const activeUserIds = Array.from(desiredUserIds.values()).filter(
    (id): id is number => typeof id === 'number' && id > 0,
  );

  if (activeUserIds.length === 0) {
    if (sharedSocket) {
      disconnectSharedConnection();
    }
    sharedUserId = null;
    notifyConnection(false);
    notifyConnectionFailed(false);
    notifySocket(sharedSocket);
    return;
  }

  const uniqueUserIds = Array.from(new Set(activeUserIds));
  const desiredUserId = uniqueUserIds[0] ?? null;

  if (!desiredUserId) return;
  if (uniqueUserIds.length > 1) {
    logError(
      'Multiple different userIds requested for socket connection:',
      uniqueUserIds,
    );
  }

  if (sharedSocket && sharedUserId === desiredUserId) {
    return;
  }

  if (sharedSocket) {
    disconnectSharedConnection();
  }

  sharedUserId = desiredUserId;
  notifyConnectionFailed(false);

  if (TRANSPORT === 'do') {
    connectDoSocket(desiredUserId);
    return;
  }
  connectSocket(desiredUserId, generation);
}

/** Provides socket state and actions for React consumers. */
export default function useSocket(userId: number | null) {
  const clientIdRef = useRef<number | null>(null);
  if (clientIdRef.current === null) {
    nextClientId += 1;
    clientIdRef.current = nextClientId;
  }

  const [socket, setSocket] = useState<RealtimeClientSocket | null>(
    sharedSocket,
  );
  const [isConnected, setIsConnected] = useState(sharedIsConnected);
  const [connectionFailed, setConnectionFailed] = useState(
    sharedConnectionFailed,
  );

  const addEventListener = useCallback((event: string, listener: Function) => {
    if (!eventListeners[event]) {
      eventListeners[event] = new Set();
    }
    eventListeners[event].add(listener);
    logInfo(`Added listener for event: ${event}`);
  }, []);

  const removeEventListener = useCallback(
    (event: string, listener: Function) => {
      if (eventListeners[event]) {
        eventListeners[event].delete(listener);
        logInfo(`Removed listener for event: ${event}`);
      }
    },
    [],
  );

  useEffect(() => {
    const clientId = clientIdRef.current;
    desiredUserIds.set(clientId, userId);
    reconcileSocketConnection();
    return () => {
      desiredUserIds.delete(clientId);
      reconcileSocketConnection();
    };
  }, [userId]);

  useEffect(() => {
    const handleConnectionUpdate = (connected: boolean) =>
      setIsConnected(connected);
    const handleConnectionFailedUpdate = (failed: boolean) =>
      setConnectionFailed(failed);
    const handleSocketUpdate = (nextSocket: RealtimeClientSocket | null) =>
      setSocket(nextSocket);
    connectionSubscribers.add(handleConnectionUpdate);
    connectionFailedSubscribers.add(handleConnectionFailedUpdate);
    socketSubscribers.add(handleSocketUpdate);
    return () => {
      connectionSubscribers.delete(handleConnectionUpdate);
      connectionFailedSubscribers.delete(handleConnectionFailedUpdate);
      socketSubscribers.delete(handleSocketUpdate);
    };
  }, []);

  const emitAddReaction = useCallback(
    (data: { messageId: number; reaction: string; roomId: number }) => {
      sharedSocket?.emit('addReaction', data);
    },
    [],
  );

  const emitRemoveReaction = useCallback(
    (data: { messageId: number; reaction: string; roomId: number }) => {
      sharedSocket?.emit('removeReaction', data);
    },
    [],
  );

  const emitMarkAsRead = useCallback(
    (
      data:
        | { messageId: number; roomId: number }
        | { messageIds: number[]; roomId: number },
    ) => {
      sharedSocket?.emit('markAsRead', data);
    },
    [],
  );

  return {
    socket,
    isConnected,
    connectionFailed,
    addEventListener,
    removeEventListener,
    emitAddReaction,
    emitRemoveReaction,
    emitMarkAsRead,
  };
}
