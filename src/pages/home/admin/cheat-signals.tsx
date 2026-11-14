import { Tabs } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import AbuseSignalsPanel from '@/components/admin/AbuseSignalsPanel';
import AdminLayout from '@/components/admin/AdminLayout';
import InvestigationSignals from '@/components/admin/InvestigationSignals';
import { serverSideTranslations } from '@/utils/serverTranslations';

const CheatSignalsPage = () => {
  const { t } = useTranslation('admin-abuse');
  const { t: tSignals } = useTranslation('admin-signals');

  return (
    <AdminLayout
      title={t('cheatSignalsTitle')}
      permissions={['VIEW_CHEAT_SIGNALS']}
    >
      <Tabs defaultValue="signals" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="signals">{t('abuseSignalsTab')}</Tabs.Tab>
          <Tabs.Tab value="computed">{tSignals('readOnlyTitle')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="signals" pt="md">
          <AbuseSignalsPanel />
        </Tabs.Panel>
        <Tabs.Panel value="computed" pt="md">
          <InvestigationSignals />
        </Tabs.Panel>
      </Tabs>
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
        'admin-signals',
      ])),
    },
  };
};

export default CheatSignalsPage;
