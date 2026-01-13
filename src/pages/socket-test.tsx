import { useEffect, useState } from 'react';
import useSocket from '@/hooks/useSocket';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import MainArea from '@/components/MainArea';
import { useTranslation } from 'next-i18next';

const SocketTestPage = (props) => {
  const { user } = useUser();
  const { socket, isConnected, addEventListener, removeEventListener } = useSocket(user?.id);
  const { t } = useTranslation('test');
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
      setMessages(prevMessages => [...prevMessages, t('socketTest.pongReceived')]);
    };

    const onAttackNotification = (data) => {
      if (receivedHashes.has(data.hash)) {
        console.log(t('socketTest.duplicateAttack'), data);
        return;
      }
      setReceivedHashes(prevHashes => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages(prevMessages => [...prevMessages, t('socketTest.attackNotification', { message: data.message })]);
    };

    const onFriendRequestNotification = (data) => {
       if (receivedHashes.has(data.hash)) {
         console.log(t('socketTest.duplicateFriendRequest'), data);
         return;
       }
       setReceivedHashes(prevHashes => {
         const newHashes = new Set(prevHashes);
         newHashes.add(data.hash);
         return newHashes;
       });
       setMessages(prevMessages => [...prevMessages, t('socketTest.friendRequestNotification', { message: data.message })]);
    };

    const onEnemyDeclarationNotification = (data) => {
       if (receivedHashes.has(data.hash)) {
         console.log(t('socketTest.duplicateEnemyDeclaration'), data);
         return;
       }
       setReceivedHashes(prevHashes => {
         const newHashes = new Set(prevHashes);
         newHashes.add(data.hash);
         return newHashes;
       });
       setMessages(prevMessages => [...prevMessages, t('socketTest.enemyDeclarationNotification', { message: data.message })]);
    };

    const onMessageNotification = (data) => {
       if (receivedHashes.has(data.hash)) {
         console.log(t('socketTest.duplicateMessage'), data);
         return;
       }
       setReceivedHashes(prevHashes => {
         const newHashes = new Set(prevHashes);
         newHashes.add(data.hash);
         return newHashes;
       });
       setMessages(prevMessages => [...prevMessages, t('socketTest.messageNotification', { message: data.message })]);
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
  }, [socket, addEventListener, removeEventListener, receivedHashes, t]);


  return (
    <MainArea
      title={t('socketTest.title')}
      >
      <p>Status: {isConnected ? t('socketTest.connected') : t('socketTest.disconnected')}</p>

      {/* Ping Pong Test */}
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={handlePing}>{t('socketTest.sendPing')}</button>

      {/* Attack Notification Test */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          id="defenderId"
          placeholder={t('socketTest.enterDefenderId')}
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
          {t('socketTest.sendAttackNotification')}
        </button>
      </div>

      {/* Add Friend Notification Test */}
      <button
        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          const userId = prompt(t('socketTest.enterUserId'));
          if (socket && userId && user) {
            socket.emit('notifyFriendRequest', { userId: parseInt(userId), message: t('socketTest.friendRequestSent', { email: user.email }) });
          }
        }}
      >
        {t('socketTest.sendFriendRequest')}
      </button>

      {/* Add Enemy Notification Test */}
      <button
        className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          const userId = prompt(t('socketTest.enterUserIdEnemy'));
          if (socket && userId && user) {
            socket.emit('notifyEnemyDeclaration', { userId: parseInt(userId), message: t('socketTest.enemyDeclared', { email: user.email }) });
          }
        }}
      >
        {t('socketTest.declareEnemy')}
      </button>

      {/* Message Notification Test */}
      <button
        className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          const userId = prompt(t('socketTest.enterUserIdMessage'));
          if (socket && userId && user) {
            socket.emit('notifyMessage', { userId: parseInt(userId), message: t('socketTest.newMessage', { email: user.email }) });
          }
        }}
      >
        {t('socketTest.sendMessage')}
      </button>

      {/* Trigger Alert Test */}
      <button
        className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={() => {
          alertService.success(t('socketTest.testAlert'));
        }}
      >
        {t('socketTest.triggerAlert')}
      </button>

      {/* Message Log */}
      <div>
        <h3>{t('socketTest.messageLog')}</h3>
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
