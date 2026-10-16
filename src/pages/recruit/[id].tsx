import type { GetServerSideProps } from 'next';

import RecruitmentFlow from '@/components/RecruitmentFlow';
import { serverSideTranslations } from '@/utils/serverTranslations';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: await serverSideTranslations(locale ?? 'en', ['common', 'navigation']),
});

export default RecruitmentFlow;
