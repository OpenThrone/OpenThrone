import { useTranslation } from 'next-i18next';
import { useEffect } from 'react';

import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import useSocket from '@/hooks/useSocket';
import { alertService } from '@/services/Alert.service';

const SocketTestPage = () => {
  const { user } = useUser();
  const { socket, isConnected } = useSocket(user?.id);
  const { t } = useTranslation('test');

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (typeof window === 'undefined') return;
    (window as any).otSocket = socket;
    return () => {
      if ((window as any).otSocket === socket) {
        delete (window as any).otSocket;
      }
    };
  }, [socket]);

  return (
    <MainArea title={t('socketTest.title')}>
      <p>
        Status:{' '}
        {isConnected ? t('socketTest.connected') : t('socketTest.disconnected')}
      </p>

      {/* Trigger Alert Test */}
      <button
        className="rounded bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={() => {
          alertService.success(t('socketTest.testAlert'));
        }}
      >
        {t('socketTest.triggerAlert')}
      </button>

    </MainArea>
  );
};

export default SocketTestPage;
