import { useEffect, useRef, useState } from 'react';

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws/'; // Use WebSocket URL

export default function useSocket(userId: number | null) {
  const socketRef = useRef<WebSocket | null>(null); // Persistent reference to the WebSocket instance
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

  useEffect(() => {
    if (!userId) {
      console.log('User ID is null, not connecting to WebSocket.');
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    if (socketRef.current) {
      console.log('WebSocket already initialized for user:', userId);
      return;
    }

    if (process.env.NEXT_PUBLIC_WS_ENABLED === 'false') return;
    console.log('Initializing WebSocket for user ID:', userId);
    const socket = new WebSocket(SERVER_URL);
    socketRef.current = socket;

    // WebSocket connection opened
    socket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);

      // Register user ID after connection
      socket.send(
        JSON.stringify({
          event: 'registerUser',
          payload: { userId },
        })
      );
    };

    // WebSocket message received
    socket.onmessage = (event) => {
      console.log('WebSocket message received:', JSON.parse(event.data).event);
      const { event: receivedEvent, payload } = JSON.parse(event.data);
      console.log(receivedEvent);
      dispatchEvent(receivedEvent, payload);
    };

    // WebSocket connection closed
    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    // WebSocket error
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
        socketRef.current?.close();
        socketRef.current = null;
    };
  }, [userId]);

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null;

    if (socketRef.current) {
      heartbeatInterval = setInterval(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ event: 'ping' }));
        }
      }, 1000); // Send ping every 30 seconds
    }

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval as NodeJS.Timeout);
    };
  }, [socketRef]);

  useEffect(() => {
    if (!isConnected && userId) {
      const reconnectInterval = setInterval(() => {
        if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) {
          const socket = new WebSocket(SERVER_URL);
          socketRef.current = socket;
        }
      }, 5000); // Try reconnecting every 5 seconds

      return () => clearInterval(reconnectInterval);
    }
  }, [isConnected, userId]);


  return { socket: socketRef.current, isConnected, addEventListener, removeEventListener };
}
