import { Badge, Group, Loader, Paper, Stack, Table, Text } from '@mantine/core';
import { PermissionType } from '@prisma/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import PermissionCheck from '@/components/PermissionCheck';
import { logError } from '@/utils/logger';

const MultiAccountPage = () => {
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClusters = async () => {
      try {
        const res = await fetch('/api/admin/abuse/multi-accounts');
        if (res.ok) setClusters(await res.json());
      } catch (err) {
        logError('Failed to load clusters:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClusters();
  }, []);

  if (loading) {
    return (
      <MainArea title="Multi-Account Detection">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </MainArea>
    );
  }

  return (
    <PermissionCheck permissions={['VIEW_MULTI_ACCOUNTS']}>
      <MainArea title="Abuse: Multi-Account Detection">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Clusters of accounts that share an IP or device hash (last 30 days).
            Shared IPs alone are not conclusive — households and mobile carriers
            cause false positives. Investigate before acting.
          </Text>

          {clusters.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              No suspicious clusters detected.
            </Text>
          ) : (
            clusters.map((c, i) => (
              <GameCard
                key={i}
                title={`${c.type} Cluster — ${c.userIds.length} accounts (${c.hash.substring(0, 16)}...)`}
              >
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User ID</Table.Th>
                      <Table.Th>Display Name</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {c.userIds.map((id: number) => (
                      <Table.Tr key={id}>
                        <Table.Td>{id}</Table.Td>
                        <Table.Td>
                          <Link href={`/userprofile/${id}`}>
                            {c.userNames?.get(id) || `User #${id}`}
                          </Link>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </GameCard>
            ))
          )}
        </Stack>
      </MainArea>
    </PermissionCheck>
  );
};

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

export default MultiAccountPage;
