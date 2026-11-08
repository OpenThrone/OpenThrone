import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import type {
  VeteranClaimErrorCode,
  VeteranClaimResult,
  VeteranClaimStatus,
} from '@/components/account/VeteranClaimView';
import { VeteranClaimView } from '@/components/account/VeteranClaimView';
import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';
import { loginHrefForReturn } from '@/utils/loginReturn';
import { serverSideTranslations } from '@/utils/serverTranslations';

const KNOWN_ERRORS: VeteranClaimErrorCode[] = [
  'INVALID_LINK',
  'NOTHING_TO_CLAIM',
  'NAME_MISMATCH',
  'NAME_TAKEN',
];

/**
 * Landing page of the Era 1 veteran claim link. Opening the link grants
 * nothing; the signed-in player presses Claim (mail scanners that prefetch
 * links cannot claim for them).
 */
const VeteranClaimPage = () => {
  const { t } = useTranslation('account');
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { forceUpdate } = useUser();
  const queryToken = router.query.token;
  const token = typeof queryToken === 'string' ? queryToken : '';
  const [displayName, setDisplayName] = useState('');
  const [state, setState] = useState<{
    status: VeteranClaimStatus;
    error: VeteranClaimErrorCode | null;
    result: VeteranClaimResult | null;
  }>({ status: 'ready', error: null, result: null });

  const status: VeteranClaimStatus =
    sessionStatus === 'unauthenticated'
      ? 'signedOut'
      : router.isReady && !token && state.status === 'ready'
        ? 'missing'
        : state.status;

  const claim = async () => {
    setState({ status: 'busy', error: null, result: null });
    try {
      const response = await fetch('/api/account/veteran-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = KNOWN_ERRORS.includes(body?.code) ? body.code : 'FAILED';
        setState({ status: 'ready', error: code, result: null });
        return;
      }
      setState({ status: 'done', error: null, result: body });
      // The name and badge show elsewhere in the shell; refresh them.
      forceUpdate();
    } catch (error) {
      logError(error);
      setState({ status: 'ready', error: 'FAILED', result: null });
    }
  };

  const resend = async () => {
    try {
      await fetch('/api/account/veteran-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      });
    } catch (error) {
      logError(error);
    }
    // Same answer either way: never reveal whether a record exists.
    setState({ status: 'resent', error: null, result: null });
  };

  return (
    <>
      <Head>
        <title>{t('veteranClaim.title')}</title>
        {/* The URL carries a one-time token: keep it out of search and referrers. */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <MainArea title={t('veteranClaim.title')}>
        <PublicAuthLayout
          title={t('veteranClaim.title')}
          description={t('veteranClaim.description')}
          formTitle={t('veteranClaim.formTitle')}
        >
          <VeteranClaimView
            status={status}
            error={state.error}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            onClaim={claim}
            onResend={resend}
            loginHref={loginHrefForReturn(router.asPath)}
            result={state.result}
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

export default VeteranClaimPage;
