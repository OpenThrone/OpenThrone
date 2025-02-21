import { useEffect, useState } from 'react';
import useSocket from '@/hooks/useSocket';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import MainArea from '@/components/MainArea';

const SocketTestPage = (props) => {
  const { user } = useUser();
  const { socket, isConnected, addEventListener, removeEventListener } = useSocket(user?.id);
  const [messages, setMessages] = useState([]);
  const [receivedHashes, setReceivedHashes] = useState(new Set());

  // Handle ping-pong logic
  const handlePing = () => {
    if (socket && user) {
      socket.emit('ping', { userId: user.id });
    }
  };

  // Listen for pong response
  useEffect(() => {
    if (!socket) return;

    const onPong = () => {
      setMessages(prevMessages => [...prevMessages, 'Pong received']);
    };

    const onAttackNotification = (data) => {
      if (receivedHashes.has(data.hash)) {
        console.log('Duplicate attack notification:', data);
        return;
      }
      setReceivedHashes(prevHashes => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages(prevMessages => [...prevMessages, `Attack notification: ${data.message}`]);
    };

    const onFriendRequestNotification = (data) => {
       if (receivedHashes.has(data.hash)) {
        console.log('Duplicate friend request notification:', data);
        return;
      }
      setReceivedHashes(prevHashes => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages(prevMessages => [...prevMessages, `Friend request notification: ${data.message}`]);
    };

    const onEnemyDeclarationNotification = (data) => {
       if (receivedHashes.has(data.hash)) {
        console.log('Duplicate enemy declaration notification:', data);
        return;
      }
      setReceivedHashes(prevHashes => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages(prevMessages => [...prevMessages, `Enemy declaration notification: ${data.message}`]);
    };

    const onMessageNotification = (data) => {
       if (receivedHashes.has(data.hash)) {
        console.log('Duplicate message notification:', data);
        return;
      }
      setReceivedHashes(prevHashes => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages(prevMessages => [...prevMessages, `Message notification: ${data.message}`]);
    };

    addEventListener('pong', onPong);
    addEventListener('attackNotification', onAttackNotification);
    addEventListener('friendRequestNotification', onFriendRequestNotification);
    addEventListener('enemyDeclarationNotification', onEnemyDeclarationNotification);
    addEventListener('messageNotification', onMessageNotification);

    return () => {
      removeEventListener('pong', onPong);
      removeEventListener('attackNotification', onAttackNotification);
      removeEventListener('friendRequestNotification', onFriendRequestNotification);
      removeEventListener('enemyDeclarationNotification', onEnemyDeclarationNotification);
      removeEventListener('messageNotification', onMessageNotification);
    };
  }, [socket, addEventListener, removeEventListener]);

  
  return (
    <MainArea
      title="Socket Test"
      >
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>

      {/* Ping Pong Test */}
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={handlePing}>Send Ping</button>

      {/* Attack Notification Test */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          id="defenderId"
          placeholder="Enter defender ID"
          className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        />
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          onClick={() => {
            const defenderId = (document.getElementById('defenderId') as HTMLInputElement)?.value;
            if (socket && defenderId && user) {
              socket.emit('notifyAttack', { battleId: Number(defenderId), defenderId: 11 });
            }
          }}
        >
          Send Attack Notification
        </button>
      </div>

      {/* Add Friend Notification Test */}
      <button
        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          const userId = prompt('Enter user ID to send friend request:');
          if (socket && userId && user) {
            socket.emit('notifyFriendRequest', { userId: parseInt(userId), message: `${user.email} has sent you a friend request!` });
          }
        }}
      >
        Send Friend Request
      </button>

      {/* Add Enemy Notification Test */}
      <button
        className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          const userId = prompt('Enter user ID to declare as enemy:');
          if (socket && userId && user) {
            socket.emit('notifyEnemyDeclaration', { userId: parseInt(userId), message: `${user.email} has declared you as an enemy!` });
          }
        }}
      >
        Declare Enemy
      </button>

      {/* Message Notification Test */}
      <button
        className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          const userId = prompt('Enter user ID to send message:');
          if (socket && userId && user) {
            socket.emit('notifyMessage', { userId: parseInt(userId), message: `You have a new message from ${user.email}!` });
          }
        }}
      >
        Send Message
      </button>

      {/* Trigger Alert Test */}
      <button
        className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          alertService.success('This is a test alert!');
        }}
      >
        Trigger Alert
      </button>

      {/* Message Log */}
      <div>
        <h3>Message Log:</h3>
        <ul>
          {messages.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      </div>
    </MainArea>
  );
};

export default SocketTestPage;
