import type { GetStaticProps } from 'next';

import LegalPage from '@/components/supporter/LegalPage';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function TermsPage() {
  return <LegalPage doc="terms" />;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'supporter',
    ])),
  },
});
