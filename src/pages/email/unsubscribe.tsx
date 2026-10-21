import { Button, Stack, Text } from '@mantine/core';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import { serverSideTranslations } from '@/utils/serverTranslations';
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/utils/unsubscribeToken';

interface Props {
  token: string | null;
  allToken: string | null;
  essential: boolean;
}
export default function Unsubscribe({ token, allToken, essential }: Props) {
  const { t } = useTranslation('email');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const unsubscribe = async (selectedToken: string) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(
        `/api/email/unsubscribe?token=${encodeURIComponent(selectedToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        },
      );
      setResult(response.ok ? 'success' : 'error');
    } catch {
      setResult('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <MainArea title={t('pageTitle')}>
      <PublicAuthLayout
        title={t('pageTitle')}
        description={t('pageDescription')}
        formTitle={t('pageTitle')}
      >
        <Stack>
          <Text role={result === 'error' ? 'alert' : 'status'}>
            {!token
              ? t('invalid')
              : result
                ? t(result)
                : essential
                  ? t('essential')
                  : t('ready')}
          </Text>
          {token && !essential && (
            <Button
              loading={busy}
              disabled={busy}
              onClick={() => unsubscribe(token)}
            >
              {t('confirm')}
            </Button>
          )}
          {allToken && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => unsubscribe(allToken)}
            >
              {t('all')}
            </Button>
          )}
          <Button
            component={Link}
            href="/home/settings#email"
            variant="outline"
          >
            {t('settings')}
          </Button>
        </Stack>
      </PublicAuthLayout>
    </MainArea>
  );
}
export const getServerSideProps: GetServerSideProps<Props> = async ({
  query,
  locale,
  res,
}) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const token =
    typeof query.token === 'string' && query.token.length <= 2048
      ? query.token
      : null;
  const payload = token ? verifyUnsubscribeToken(token) : null;
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', [
        'common',
        'navigation',
        'email',
      ])),
      token: payload ? token : null,
      allToken: payload ? createUnsubscribeToken(payload.userId, 'ALL') : null,
      essential:
        payload?.category === 'TRANSACTIONAL' ||
        payload?.category === 'ACCOUNT_LIFECYCLE',
    },
  };
};
