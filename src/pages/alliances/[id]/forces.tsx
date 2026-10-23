import { Alert, Button, Loader, Stack } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

import type { AllianceDuesData } from '@/components/alliance/AllianceDues';
import { AllianceDues } from '@/components/alliance/AllianceDues';
import type { AllianceForcesData } from '@/components/alliance/AllianceForces';
import { AllianceForces } from '@/components/alliance/AllianceForces';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';

export default function AllianceTroops() {
  const { query } = useRouter();
  const { t } = useTranslation('allianceForces');
  const { forceUpdate } = useUser();
  const [data, setData] = useState<AllianceForcesData | null>(null);
  const [dues, setDues] = useState<AllianceDuesData | null>(null);
  const [error, setError] = useState('');
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorSummary.current?.focus();
      errorSummary.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const pendingOperations = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    if (!query.id) return;
    try {
      const response = await fetch(`/api/alliances/${query.id}/forces`);
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? t('loadError'));
        return;
      }
      const duesResponse = await fetch(`/api/alliances/${query.id}/dues`);
      if (!duesResponse.ok) {
        setError(t('loadError'));
        return;
      }
      setDues(await duesResponse.json());
      setData(result);
    } catch (error) {
      logError(error);
      setError(t('loadError'));
    }
  }, [query.id, t]);
  useEffect(() => {
    load().catch(logError);
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);
  const order = async (command: Record<string, unknown>) => {
    if (submitting.current) return;
    const fingerprint = JSON.stringify(command);
    const operationId =
      pendingOperations.current.get(fingerprint) ?? crypto.randomUUID();
    pendingOperations.current.set(fingerprint, operationId);
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/alliances/${query.id}/${['levy', 'rule', 'pay', 'designate', 'waive'].includes(String(command.action)) ? 'dues' : 'forces'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...command,
            ...(['policy', 'rule', 'designate', 'waive'].includes(
              String(command.action),
            )
              ? {}
              : { operationId }),
          }),
        },
      );
      const result = await response.json();
      if (response.ok || (response.status >= 400 && response.status < 500))
        pendingOperations.current.delete(fingerprint);
      if (!response.ok) {
        setError(result.message ?? t('orderError'));
        return;
      }
      await Promise.all([
        load(),
        forceUpdate(),
        mutate('/api/forces/dues-summary'),
      ]);
    } catch (error) {
      logError(error);
      setError(t('orderError'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <MainArea
      title={data ? t('title', { alliance: data.allianceName }) : t('pool')}
    >
      <Button
        component={Link}
        href={`/alliances/${query.id}`}
        variant="subtle"
        mb="md"
      >
        {t('back')}
      </Button>
      {error && (
        <Alert
          ref={errorSummary}
          tabIndex={-1}
          color="red"
          role="alert"
          mb="md"
        >
          {error}
        </Alert>
      )}
      {data ? (
        <Stack gap="lg">
          <AllianceForces data={data} busy={busy} onOrder={order} />
          {dues && (
            <AllianceDues data={data} dues={dues} busy={busy} onOrder={order} />
          )}
        </Stack>
      ) : !error ? (
        <Loader aria-label={t('loading')} />
      ) : null}
    </MainArea>
  );
}
export const getServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'allianceForces',
    ])),
  },
});
