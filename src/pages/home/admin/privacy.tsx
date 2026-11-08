import type { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import AdminLayout from '@/components/admin/AdminLayout';
import PrivacyRequestsPanelLive from '@/components/admin/PrivacyRequestsPanelLive';

/** Administrators only: erasure and export requests, with reasoned cancel / erase-now. */
const PrivacyAdminPage = () => {
  const { t } = useTranslation('admin-users');
  return (
    <AdminLayout title={t('privacy.title')} administratorOnly>
      <PrivacyRequestsPanelLive />
    </AdminLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-users',
    ])),
  },
});

export default PrivacyAdminPage;
