import type { GetStaticProps } from 'next';

import LegalPage from '@/components/supporter/LegalPage';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function RefundsPage() {
  return <LegalPage doc="refunds" />;
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
