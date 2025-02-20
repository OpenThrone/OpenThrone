import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

export default function useSocket(userId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventListeners = useRef<{ [key: string]: Function[] }>({});

  const addEventListener = (event: string, listener: Function) => {
    if (!eventListeners.current[event]) {
      eventListeners.current[event] = [];
    }
    eventListeners.current[event].push(listener);
  };

  const removeEventListener = (event: string, listener: Function) => {
    eventListeners.current[event] = (eventListeners.current[event] || []).filter((l) => l !== listener);
  };

  const dispatchEvent = (event: string, data: any) => {
    (eventListeners.current[event] || []).forEach((listener) => listener(data));
  };

  if (!socketRef.current) {
    const socket = io(SERVER_URL, { withCredentials: true });
    console.log('Connecting to Socket.IO:', SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setIsConnected(false);
    });

    socket.onAny((event, data) => {
      dispatchEvent(event, data);
    });
  }

  // Handle userId changes
  useEffect(() => {
    if (!userId) {
      console.log('User ID is null, disconnecting from Socket.IO.');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    if (socketRef.current && isConnected) {
      console.log('Registering user with Socket.IO:', userId);
      socketRef.current.emit('registerUser', { userId });
    }

    return () => {
      // socketRef.current?.disconnect(); // Removing this line as the socket is now persistent
      // socketRef.current = null;
    };
  }, [userId, isConnected]);

  return {
    socket: socketRef.current,
    isConnected,
    addEventListener,
    removeEventListener,
  };
}
