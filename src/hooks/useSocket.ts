import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

import { logError, logInfo } from '@/utils/logger';

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;
const RECONNECT_DELAY_MAX_MS = 30000;

let nextClientId = 0;
const desiredUserIds = new Map<number, number | null>();

let sharedSocket: Socket | null = null;
let sharedUserId: number | null = null;
let sharedIsConnected = false;
let sharedConnectionFailed = false;

const connectionSubscribers = new Set<(connected: boolean) => void>();
const connectionFailedSubscribers = new Set<(failed: boolean) => void>();
const socketSubscribers = new Set<(socket: Socket | null) => void>();
const eventListeners: Record<string, Set<Function>> = {};

function notifyConnection(connected: boolean) {
  sharedIsConnected = connected;
  connectionSubscribers.forEach((subscriber) => subscriber(connected));
}

function notifyConnectionFailed(failed: boolean) {
  sharedConnectionFailed = failed;
  connectionFailedSubscribers.forEach((subscriber) => subscriber(failed));
}

function notifySocket(socket: Socket | null) {
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

function reconcileSocketConnection() {
  const activeUserIds = Array.from(desiredUserIds.values()).filter(
    (id): id is number => typeof id === 'number' && id > 0,
  );

  if (activeUserIds.length === 0) {
    if (sharedSocket) {
      sharedSocket.disconnect();
      sharedSocket = null;
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
    sharedSocket.disconnect();
    sharedSocket = null;
  }

  sharedUserId = desiredUserId;
  sharedSocket = io(SERVER_URL, {
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_DELAY_MS,
    reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
  });
  notifySocket(sharedSocket);
  notifyConnectionFailed(false);

  logInfo('Connecting to Socket.IO:', SERVER_URL);

  sharedSocket.on('connect', () => {
    logInfo('Socket.IO connected');
    notifyConnection(true);
    notifyConnectionFailed(false);
    sharedSocket?.emit('registerUser', { userId: desiredUserId });
  });

  sharedSocket.on('disconnect', () => {
    logInfo('Socket.IO disconnected');
    notifyConnection(false);
  });

  sharedSocket.on('reconnect', () => {
    logInfo('Socket.IO reconnected, re-registering user and rooms');
    notifyConnection(true);
    notifyConnectionFailed(false);
    sharedSocket?.emit('registerUser', { userId: desiredUserId });
  });

  sharedSocket.on('reconnect_attempt', (attempt) => {
    logInfo(`Socket.IO reconnect attempt ${attempt}/${RECONNECT_ATTEMPTS}`);
  });

  sharedSocket.on('reconnect_failed', () => {
    logError('Socket.IO reconnect failed; giving up');
    notifyConnection(false);
    notifyConnectionFailed(true);
  });

  sharedSocket.onAny((event, data) => {
    dispatchEvent(event, data);
  });
}

/** Provides socket state and actions for React consumers. */
export default function useSocket(userId: number | null) {
  const clientIdRef = useRef<number | null>(null);
  if (clientIdRef.current === null) {
    nextClientId += 1;
    clientIdRef.current = nextClientId;
  }

  const [socket, setSocket] = useState<Socket | null>(sharedSocket);
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
    const handleSocketUpdate = (nextSocket: Socket | null) =>
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
