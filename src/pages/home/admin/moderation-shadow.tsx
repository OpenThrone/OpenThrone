import { useTranslation } from 'next-i18next';

import AdminLayout from '@/components/admin/AdminLayout';
import ChatModerationShadowPanel from '@/components/admin/ChatModerationShadowPanel';
import { serverSideTranslations } from '@/utils/serverTranslations';

const ModerationShadowPage = () => {
  const { t } = useTranslation('admin-abuse');

  return (
    <AdminLayout title={t('chatShadow.title')} permissions={['VIEW_CHAT_LOGS']}>
      <ChatModerationShadowPanel />
    </AdminLayout>
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
        'admin-abuse',
      ])),
    },
  };
};

export default ModerationShadowPage;
