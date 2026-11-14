import { DEFAULT_ONLOAD_NAME, SCRIPT_URL } from '@marsidev/react-turnstile';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';

import RecruitmentFlow from '@/components/RecruitmentFlow';
import { getRecruitmentCaptcha } from '@/services/RecruitmentCaptcha.service';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

interface RecruitPageProps {
  /** Only a Turnstile page warms up the connection to Cloudflare. */
  captchaProvider: 'altcha' | 'turnstile' | null;
}

export const getServerSideProps: GetServerSideProps<RecruitPageProps> = async ({
  locale,
}) => {
  let captchaProvider: RecruitPageProps['captchaProvider'] = null;
  try {
    captchaProvider = (await getRecruitmentCaptcha()).provider;
  } catch (error) {
    // The flow still learns the provider from its eligibility call.
    logError('Could not read the recruitment captcha provider', error);
  }
  return {
    props: {
      captchaProvider,
      ...(await serverSideTranslations(locale ?? 'en', [
        'common',
        'navigation',
      ])),
    },
  };
};

export default function RecruitPage({ captchaProvider }: RecruitPageProps) {
  const { query } = useRouter();
  return (
    <>
      {captchaProvider === 'turnstile' && (
        <Head>
          <link rel="preconnect" href="https://challenges.cloudflare.com" />
          <link
            rel="preload"
            as="script"
            href={`${SCRIPT_URL}?onload=${DEFAULT_ONLOAD_NAME}&render=explicit`}
          />
        </Head>
      )}
      <RecruitmentFlow
        mode={query.mode === 'internal' ? 'internal' : 'external'}
      />
    </>
  );
}
