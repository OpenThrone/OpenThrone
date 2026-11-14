import {
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

type ClusterType = 'IP' | 'NETWORK_BROWSER' | 'IP_RANGE';

type Cluster = {
  type: ClusterType;
  hash: string;
  userIds: number[];
  userNames: Record<number, string>;
  kinds: string[];
  firstSeen: string;
  lastSeen: string;
};

const TYPE_LABEL_KEY: Record<ClusterType, string> = {
  IP: 'ipPattern',
  NETWORK_BROWSER: 'networkBrowserPattern',
  IP_RANGE: 'rangePattern',
};

const formatDate = (value: string) =>
  value ? new Date(value).toISOString().slice(0, 10) : '—';

const MultiAccountPage = () => {
  const { t } = useTranslation('admin-abuse');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchClusters = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/abuse/multi-accounts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClusters(await res.json());
      setLoadError(false);
    } catch (err) {
      logError('Failed to load clusters:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Multi-Account Detection">
        <Stack align="center" py="xl" role="status" aria-live="polite">
          <Loader />
        </Stack>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={t('multiAccountsTitle')}
      permissions={['VIEW_MULTI_ACCOUNTS']}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('multiAccountsIntro')}
        </Text>

        {loadError ? (
          <Stack align="center" role="alert">
            <Text c="red">{t('loadFailed')}</Text>
            <Button variant="default" onClick={fetchClusters}>
              {t('retry')}
            </Button>
          </Stack>
        ) : clusters.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            {t('noClusters')}
          </Text>
        ) : (
          clusters.map((c, i) => (
            <GameCard
              key={i}
              title={t('clusterTitle', {
                type: t(TYPE_LABEL_KEY[c.type]),
                count: c.userIds.length,
                hash: c.hash,
              })}
            >
              <Stack gap="xs">
                {c.type === 'IP_RANGE' && (
                  <Text size="sm" c="dimmed">
                    {t('rangeWeakerEvidence')}
                  </Text>
                )}
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    {t('eventKinds')}
                  </Text>
                  <Group gap="xs">
                    {c.kinds.map((kind) => (
                      <Tooltip
                        key={kind}
                        label={t(`kindHelp.${kind}`, {
                          defaultValue: kind,
                        })}
                      >
                        <Badge variant="light" size="sm">
                          {t(`kinds.${kind}`, { defaultValue: kind })}
                        </Badge>
                      </Tooltip>
                    ))}
                  </Group>
                </Stack>
                <Text size="sm" c="dimmed">
                  {t('firstSeen')}: {formatDate(c.firstSeen)} · {t('lastSeen')}:{' '}
                  {formatDate(c.lastSeen)}
                </Text>
                <AdminDataTable size="compact">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('userId')}</Table.Th>
                      <Table.Th>{t('displayName')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {c.userIds.map((id: number) => (
                      <Table.Tr key={id}>
                        <Table.Td>{id}</Table.Td>
                        <Table.Td>
                          <Link href={`/userprofile/${id}`}>
                            {c.userNames?.[id] || t('userNumber', { id })}
                          </Link>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
              </Stack>
            </GameCard>
          ))
        )}
      </Stack>
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

export default MultiAccountPage;
