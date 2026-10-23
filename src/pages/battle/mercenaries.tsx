import { Alert, Loader } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  MercenaryContract,
  MercenaryOffer,
  MercenaryOrder,
} from '@/components/game/MercenaryBarracks';
import { MercenaryBarracks } from '@/components/game/MercenaryBarracks';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';

export default function Mercenaries() {
  const { t } = useTranslation('mercenaries');
  const { user, forceUpdate } = useUser();
  const [data, setData] = useState<{
    offers: MercenaryOffer[];
    contracts: MercenaryContract[];
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const pendingOperations = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/mercenaries');
      if (!response.ok) throw new Error('Load failed');
      setData(await response.json());
    } catch (err) {
      logError(err);
      setError(t('loadError'));
    }
  }, [t]);
  useEffect(() => {
    load().catch(logError);
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);
  const order = async (command: MercenaryOrder) => {
    if (submitting.current) return;
    const fingerprint = JSON.stringify(command);
    const operationId =
      pendingOperations.current.get(fingerprint) ?? crypto.randomUUID();
    pendingOperations.current.set(fingerprint, operationId);
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/mercenaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...command, operationId }),
      });
      const result = await response.json();
      if (response.ok || (response.status >= 400 && response.status < 500))
        pendingOperations.current.delete(fingerprint);
      if (!response.ok) {
        setError(result.message ?? t('orderError'));
        return;
      }
      await Promise.all([load(), forceUpdate()]);
    } catch (err) {
      logError(err);
      setError(t('orderError'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <MainArea title={t('title')}>
      {!data ? (
        error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : (
          <Loader aria-label={t('loading')} />
        )
      ) : (
        <MercenaryBarracks
          {...data}
          fortLevel={user?.fortLevel ?? 0}
          gold={String(user?.gold ?? 0)}
          busy={busy}
          error={error}
          onOrder={order}
        />
      )}
    </MainArea>
  );
}
export const getServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'mercenaries',
    ])),
  },
});
