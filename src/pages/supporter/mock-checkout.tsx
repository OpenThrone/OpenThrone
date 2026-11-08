import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import { GiftReveal, money } from '@/components/supporter/SupporterParts';
import type { SupporterPlanId } from '@/types/supporter';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function MockCheckout() {
  const { t } = useTranslation('supporter');
  const { query } = useRouter();
  const session = typeof query.session === 'string' ? query.session : '';
  const [summary, setSummary] = useState<{
    planId: SupporterPlanId | 'alliance_sponsorship';
    amountCents: number;
    open: boolean;
  } | null>(null);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch(
      `/api/supporter/mock-checkout/summary?session=${encodeURIComponent(session)}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setSummaryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<{
    giftCode: string;
    redirect: string;
  } | null>(null);
  const confirm = async (outcome: 'success' | 'fail') => {
    if (busy || !session) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/supporter/mock-checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, outcome }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.giftCode) setResult(data);
      else window.location.assign(data.redirect);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <MainArea title={t('testPayment')}>
      <Stack>
        <Alert color="yellow" title={t('testBanner')}>
          {t('testPayment')}
        </Alert>
        {summary ? (
          <Stack gap="xs">
            <Text fw={700} size="lg">
              {summary.planId === 'alliance_sponsorship'
                ? t('kinds.ALLIANCE_SPONSORSHIP')
                : t(`plans.${summary.planId}`)}
            </Text>
            {summary.planId !== 'alliance_sponsorship' && (
              <Text>{t(`planDetails.${summary.planId}`)}</Text>
            )}
            <Text fw={700}>{money(summary.amountCents)}</Text>
          </Stack>
        ) : (
          summaryLoaded && <Text>{t('summaryUnavailable')}</Text>
        )}
        <Text>
          {t('session')}: {session || '—'}
        </Text>
        {error && (
          <Alert color="red" role="alert">
            {t('error')}
          </Alert>
        )}
        {result ? (
          <>
            <GiftReveal code={result.giftCode} />
            <Button onClick={() => window.location.assign(result.redirect)}>
              {t('done')}
            </Button>
          </>
        ) : (
          <Group>
            <Button
              loading={busy}
              disabled={!summary?.open}
              onClick={() => confirm('success')}
            >
              {t('payTest')}
            </Button>
            <Button
              variant="light"
              color="red"
              disabled={busy || !summary?.open}
              onClick={() => confirm('fail')}
            >
              {t('decline')}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !session}
              component={Link}
              href="/home/supporter"
            >
              {t('cancel')}
            </Button>
          </Group>
        )}
      </Stack>
    </MainArea>
  );
}
export const getServerSideProps = async ({ locale }: { locale?: string }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'supporter',
    ])),
  },
});
