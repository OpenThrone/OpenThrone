import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import type { ConfirmErasureStatus } from '@/components/account/ConfirmErasureView';
import { ConfirmErasureView } from '@/components/account/ConfirmErasureView';
import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

/**
 * Landing page of the emailed confirmation link. Opening the link changes
 * nothing; the visitor presses the button, which sends the token to the API.
 * (Mail scanners that prefetch links therefore cannot confirm for the player.)
 */
const ConfirmErasurePage = () => {
  const { t } = useTranslation('account');
  const router = useRouter();
  const queryToken = router.query.token;
  const token = typeof queryToken === 'string' ? queryToken : '';
  const [state, setState] = useState<{
    status: ConfirmErasureStatus;
    scheduledFor: string | null;
  }>({ status: 'ready', scheduledFor: null });

  const status: ConfirmErasureStatus =
    router.isReady && !token ? 'missing' : state.status;

  const confirm = async () => {
    setState({ status: 'busy', scheduledFor: null });
    try {
      const response = await fetch('/api/account/erasure/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setState({ status: 'invalid', scheduledFor: null });
        return;
      }
      const body = await response.json();
      setState({ status: 'done', scheduledFor: body.scheduledFor ?? null });
    } catch (error) {
      logError(error);
      setState({ status: 'invalid', scheduledFor: null });
    }
  };

  return (
    <>
      <Head>
        <title>{t('confirmErasure.title')}</title>
        {/* The URL carries a one-time token: keep it out of search and referrers. */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <MainArea title={t('confirmErasure.title')}>
        <PublicAuthLayout
          title={t('confirmErasure.title')}
          description={t('confirmErasure.description')}
          formTitle={t('confirmErasure.formTitle')}
        >
          <ConfirmErasureView
            status={status}
            scheduledFor={state.scheduledFor}
            onConfirm={confirm}
          />
        </PublicAuthLayout>
      </MainArea>
    </>
  );
};

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'account',
    ])),
  },
});

export default ConfirmErasurePage;
