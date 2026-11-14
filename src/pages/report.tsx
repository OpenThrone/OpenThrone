import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { ReportPlayerForm } from '@/components/ReportPlayerForm';
import { serverSideTranslations } from '@/utils/serverTranslations';

/** Full-page report form; the profile opens a modal and links here as a fallback. */
const ReportPage = () => {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { userId: queryUserId, username: queryUsername } = router.query;
  const presetUserId = Number(queryUserId);

  return (
    <MainArea title={t('report.title')}>
      <GameCard title={t('report.formTitle')}>
        {router.isReady && (
          <ReportPlayerForm
            presetUserId={
              Number.isSafeInteger(presetUserId) && presetUserId > 0
                ? presetUserId
                : null
            }
            presetUsername={
              typeof queryUsername === 'string' && queryUsername
                ? queryUsername
                : null
            }
            onDone={() => router.push('/home/overview')}
            onCancel={() => router.back()}
          />
        )}
      </GameCard>
    </MainArea>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
      ])),
    },
  };
};

export default ReportPage;
