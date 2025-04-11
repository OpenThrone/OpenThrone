import { logInfo } from '@/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

export default function useSocket(userId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventListeners = useRef<{ [key: string]: Set<Function> }>({}); // Use Set for easier removal

  // Memoize addEventListener to ensure stable reference
  const addEventListener = useCallback((event: string, listener: Function) => {
    if (!eventListeners.current[event]) {
      eventListeners.current[event] = new Set();
    }
    eventListeners.current[event].add(listener);
    logInfo(`Added listener for event: ${event}`);
  }, []); // Empty dependency array means this function reference never changes

  // Memoize removeEventListener
  const removeEventListener = useCallback((event: string, listener: Function) => {
    if (eventListeners.current[event]) {
      eventListeners.current[event].delete(listener);
      logInfo(`Removed listener for event: ${event}`);
    }
  }, []); // Empty dependency array

  // Dispatch event helper (doesn't need memoization as it's internal)
  const dispatchEvent = (event: string, data: any) => {
    logInfo(`Dispatching event: ${event}`, data);
    eventListeners.current[event]?.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in listener for event ${event}:`, error);
      }
    });
  };

  if (!socketRef.current) {
    const socket = io(SERVER_URL, { withCredentials: true });
    logInfo('Connecting to Socket.IO:', SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      logInfo('Socket.IO connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      logInfo('Socket.IO disconnected');
      setIsConnected(false);
    });

    socket.onAny((event, data) => {
      dispatchEvent(event, data);
    });
  }

  // Handle userId changes
  useEffect(() => {
    if (!userId) {
      logInfo('User ID is null, disconnecting from Socket.IO.');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    if (socketRef.current && isConnected) {
      logInfo('Registering user with Socket.IO:', userId);
      socketRef.current.emit('registerUser', { userId });
    }

    return () => {
      // socketRef.current?.disconnect(); // Removing this line as the socket is now persistent
      // socketRef.current = null;
    };
  }, [userId, isConnected]);

  // --- Emitter Functions ---
  const emitAddReaction = (data: { messageId: number; reaction: string; roomId: number }) => {
    socketRef.current?.emit('addReaction', data);
  };

  const emitRemoveReaction = (data: { messageId: number; reaction: string; roomId: number }) => {
    socketRef.current?.emit('removeReaction', data);
  };

  const emitMarkAsRead = (data: { messageId: number; roomId: number } | { messageIds: number[]; roomId: number }) => {
    socketRef.current?.emit('markAsRead', data);
  };

  // Add other emitters here if needed (e.g., for typing indicators)


  return {
    socket: socketRef.current,
    isConnected,
    addEventListener,
    removeEventListener,
    // Expose emitter functions
    emitAddReaction,
    emitRemoveReaction,
    emitMarkAsRead,
  };
}
