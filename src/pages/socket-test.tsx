import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import useSocket from '@/hooks/useSocket';
import { alertService } from '@/services/Alert.service';
import { logInfo } from '@/utils/logger';

const SocketTestPage = () => {
  const { user } = useUser();
  const { socket, isConnected, addEventListener, removeEventListener } =
    useSocket(user?.id);
  const { t } = useTranslation('test');
  const [messages, setMessages] = useState([]);
  const [receivedHashes, setReceivedHashes] = useState(new Set());
  const [friendRequestTargetId, setFriendRequestTargetId] = useState('');
  const [enemyTargetId, setEnemyTargetId] = useState('');
  const [messageTargetId, setMessageTargetId] = useState('');

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
      setMessages((prevMessages) => [
        ...prevMessages,
        t('socketTest.pongReceived'),
      ]);
    };

    const onAttackNotification = (data) => {
      if (receivedHashes.has(data.hash)) {
        logInfo(t('socketTest.duplicateAttack'), data);
        return;
      }
      setReceivedHashes((prevHashes) => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages((prevMessages) => [
        ...prevMessages,
        t('socketTest.attackNotification', { message: data.message }),
      ]);
    };

    const onFriendRequestNotification = (data) => {
      if (receivedHashes.has(data.hash)) {
        logInfo(t('socketTest.duplicateFriendRequest'), data);
        return;
      }
      setReceivedHashes((prevHashes) => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages((prevMessages) => [
        ...prevMessages,
        t('socketTest.friendRequestNotification', { message: data.message }),
      ]);
    };

    const onEnemyDeclarationNotification = (data) => {
      if (receivedHashes.has(data.hash)) {
        logInfo(t('socketTest.duplicateEnemyDeclaration'), data);
        return;
      }
      setReceivedHashes((prevHashes) => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages((prevMessages) => [
        ...prevMessages,
        t('socketTest.enemyDeclarationNotification', { message: data.message }),
      ]);
    };

    const onMessageNotification = (data) => {
      if (receivedHashes.has(data.hash)) {
        logInfo(t('socketTest.duplicateMessage'), data);
        return;
      }
      setReceivedHashes((prevHashes) => {
        const newHashes = new Set(prevHashes);
        newHashes.add(data.hash);
        return newHashes;
      });
      setMessages((prevMessages) => [
        ...prevMessages,
        t('socketTest.messageNotification', { message: data.message }),
      ]);
    };

    addEventListener('pong', onPong);
    addEventListener('attackNotification', onAttackNotification);
    addEventListener('friendRequestNotification', onFriendRequestNotification);
    addEventListener(
      'enemyDeclarationNotification',
      onEnemyDeclarationNotification,
    );
    addEventListener('messageNotification', onMessageNotification);

    return () => {
      removeEventListener('pong', onPong);
      removeEventListener('attackNotification', onAttackNotification);
      removeEventListener(
        'friendRequestNotification',
        onFriendRequestNotification,
      );
      removeEventListener(
        'enemyDeclarationNotification',
        onEnemyDeclarationNotification,
      );
      removeEventListener('messageNotification', onMessageNotification);
    };
  }, [socket, addEventListener, removeEventListener, receivedHashes, t]);

  return (
    <MainArea title={t('socketTest.title')}>
      <p>
        Status:{' '}
        {isConnected ? t('socketTest.connected') : t('socketTest.disconnected')}
      </p>

      {/* Ping Pong Test */}
      <button
        className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={handlePing}
      >
        {t('socketTest.sendPing')}
      </button>

      {/* Attack Notification Test */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          id="defenderId"
          placeholder={t('socketTest.enterDefenderId')}
          className="appearance-none rounded border px-3 py-2 leading-tight text-gray-700 shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        />
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onClick={() => {
            const defenderId = (
              document.getElementById('defenderId') as HTMLInputElement
            )?.value;
            if (socket && defenderId && user) {
              socket.emit('notifyAttack', {
                battleId: Number(defenderId),
                defenderId: 11,
              });
            }
          }}
        >
          {t('socketTest.sendAttackNotification')}
        </button>
      </div>

      {/* Add Friend Notification Test */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          value={friendRequestTargetId}
          onChange={(event) => setFriendRequestTargetId(event.target.value)}
          placeholder={t('socketTest.enterUserId')}
          className="appearance-none rounded border px-3 py-2 leading-tight text-gray-700 shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        />
        <button
          className="rounded bg-green-500 px-4 py-2 font-bold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onClick={() => {
            if (socket && friendRequestTargetId && user) {
              socket.emit('notifyFriendRequest', {
                userId: parseInt(friendRequestTargetId, 10),
                message: t('socketTest.friendRequestSent', {
                  email: user.email,
                }),
              });
            }
          }}
        >
          {t('socketTest.sendFriendRequest')}
        </button>
      </div>

      {/* Add Enemy Notification Test */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          value={enemyTargetId}
          onChange={(event) => setEnemyTargetId(event.target.value)}
          placeholder={t('socketTest.enterUserIdEnemy')}
          className="appearance-none rounded border px-3 py-2 leading-tight text-gray-700 shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        />
        <button
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onClick={() => {
            if (socket && enemyTargetId && user) {
              socket.emit('notifyEnemyDeclaration', {
                userId: parseInt(enemyTargetId, 10),
                message: t('socketTest.enemyDeclared', { email: user.email }),
              });
            }
          }}
        >
          {t('socketTest.declareEnemy')}
        </button>
      </div>

      {/* Message Notification Test */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          value={messageTargetId}
          onChange={(event) => setMessageTargetId(event.target.value)}
          placeholder={t('socketTest.enterUserIdMessage')}
          className="appearance-none rounded border px-3 py-2 leading-tight text-gray-700 shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        />
        <button
          className="rounded bg-purple-500 px-4 py-2 font-bold text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onClick={() => {
            if (socket && messageTargetId && user) {
              socket.emit('notifyMessage', {
                userId: parseInt(messageTargetId, 10),
                message: t('socketTest.newMessage', { email: user.email }),
              });
            }
          }}
        >
          {t('socketTest.sendMessage')}
        </button>
      </div>

      {/* Trigger Alert Test */}
      <button
        className="rounded bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
