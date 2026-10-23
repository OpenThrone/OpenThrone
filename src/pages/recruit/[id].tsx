import { DEFAULT_ONLOAD_NAME, SCRIPT_URL } from '@marsidev/react-turnstile';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';

import RecruitmentFlow from '@/components/RecruitmentFlow';
import { serverSideTranslations } from '@/utils/serverTranslations';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: await serverSideTranslations(locale ?? 'en', ['common', 'navigation']),
});

export default function RecruitPage() {
  const { query } = useRouter();
  return (
    <>
      <Head>
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
        <link
          rel="preload"
          as="script"
          href={`${SCRIPT_URL}?onload=${DEFAULT_ONLOAD_NAME}&render=explicit`}
        />
      </Head>
      <RecruitmentFlow
        mode={query.mode === 'internal' ? 'internal' : 'external'}
      />
    </>
  );
}
