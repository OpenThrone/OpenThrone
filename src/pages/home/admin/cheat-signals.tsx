import {
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import InvestigationSignals from '@/components/admin/InvestigationSignals';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const severityColor = (s: string) => {
  switch (s) {
    case 'CRITICAL':
      return 'red';
    case 'HIGH':
      return 'orange';
    case 'MEDIUM':
      return 'yellow';
    case 'LOW':
      return 'gray';
    default:
      return 'gray';
  }
};

const CheatSignalsPage = () => {
  const { t } = useTranslation('admin-abuse');
  const { t: tSignals } = useTranslation('admin-signals');
  const { user } = useUser();
  const canAct = Boolean(
    user?.permissions?.some(
      (permission) => permission.type === 'MANAGE_ACCOUNT_STATUS',
    ),
  );
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/abuse/cheat-signals');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setLoadError(false);
    } catch (err) {
      logError('Failed to load signals:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, []);

  const handleAction = async (
    id: number,
    action: 'acknowledge' | 'dismiss' | 'takeAction',
  ) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/abuse/cheat-signals/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId: id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alertService.notify('success', t('signalUpdated'), {
        title: t('updated'),
      });
      await fetchSignals();
    } catch (error) {
      logError('Failed to update cheat signal', error);
      alertService.notify('error', t('actionFailed'), { title: t('error') });
    } finally {
      setActionId(null);
    }
  };

  return (
    <AdminLayout
      title={t('cheatSignalsTitle')}
      permissions={['VIEW_CHEAT_SIGNALS']}
    >
      <Tabs defaultValue="computed">
        <Tabs.List>
          <Tabs.Tab value="computed">{tSignals('readOnlyTitle')}</Tabs.Tab>
          <Tabs.Tab value="saved">{tSignals('savedSignals')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="computed" pt="md">
          <InvestigationSignals />
        </Tabs.Panel>
        <Tabs.Panel value="saved" pt="md">
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {t('cheatSignalsIntro')}
            </Text>

            {loading ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : signals.length === 0 ? (
              loadError ? (
                <Group justify="center" py="md" role="alert">
                  <Text c="red">{t('loadFailed')}</Text>
                  <Button variant="default" onClick={fetchSignals}>
                    {t('retry')}
                  </Button>
                </Group>
              ) : (
                <Text c="dimmed" ta="center" py="md">
                  {t('noSignals')}
                </Text>
              )
            ) : (
              <AdminDataTable size="wide" ariaLabel={tSignals('savedSignals')}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('severity')}</Table.Th>
                    <Table.Th>{t('type')}</Table.Th>
                    <Table.Th>{t('user')}</Table.Th>
                    <Table.Th>{t('score')}</Table.Th>
                    <Table.Th>{t('summary')}</Table.Th>
                    <Table.Th>{t('firstSeen')}</Table.Th>
                    <Table.Th>{t('status')}</Table.Th>
                    {canAct && <Table.Th>{t('actions')}</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {signals.map((s) => (
                    <Table.Tr key={s.id}>
                      <Table.Td>
                        <Badge color={severityColor(s.severity)}>
                          {s.severity}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {t(`signalTypes.${s.type}`, {
                          defaultValue: s.type.replaceAll('_', ' '),
                        })}
                      </Table.Td>
                      <Table.Td>
                        {s.user?.display_name || t('unknownUser')} ({t('id')}:{' '}
                        {s.userId})
                      </Table.Td>
                      <Table.Td>{s.score}</Table.Td>
                      <Table.Td style={{ maxWidth: 300 }}>{s.summary}</Table.Td>
                      <Table.Td>
                        {new Date(s.firstSeenAt).toLocaleString()}
                      </Table.Td>
                      <Table.Td>{s.status}</Table.Td>
                      {canAct && (
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="default"
                              onClick={() => handleAction(s.id, 'acknowledge')}
                              loading={actionId === s.id}
                              disabled={actionId !== null && actionId !== s.id}
                            >
                              {t('acknowledge')}
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="subtle"
                              onClick={() => handleAction(s.id, 'dismiss')}
                              loading={actionId === s.id}
                              disabled={actionId !== null && actionId !== s.id}
                            >
                              {t('dismiss')}
                            </Button>
                            <Button
                              size="xs"
                              color="green"
                              variant="subtle"
                              onClick={() => handleAction(s.id, 'takeAction')}
                              loading={actionId === s.id}
                              disabled={actionId !== null && actionId !== s.id}
                            >
                              {t('markActionTaken')}
                            </Button>
                          </Group>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AdminDataTable>
            )}
          </Stack>
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
