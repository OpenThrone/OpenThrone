import { useEffect, useState } from 'react';
import useSocket from '@/hooks/useSocket';
import { useUser } from '@/context/users';

const SocketTestPage = (props) => {
  const { user } = useUser();
  const { socket, isConnected, addEventListener, removeEventListener } = useSocket(user?.id); // Use a mock userId of 1 for testing

  // Handle ping-pong logic
  const handlePing = () => {
    if (socket) {
      socket.emit('ping', { userId: 1 }); // Use a mock userId of 1 for testing
    }
  };

  // Listen for pong response
  useEffect(() => {
    if (!socket) return;

    const onPong = () => {
      alert('Pong received');
    };

    addEventListener('pong', onPong);

    return () => {
      removeEventListener('pong', onPong);
    };
  }, [socket, addEventListener, removeEventListener]);

  
  return (
    <div>
      <h1>Socket Test</h1>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>

      {/* Ping Pong Test */}
      <button onClick={handlePing}>Send Ping</button>

      {/* Add more tests here */}
    </div>
  );
};

export default SocketTestPage;
