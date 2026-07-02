import {
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const BansDashboardPage = () => {
  const [bans, setBans] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [unbanningId, setUnbanningId] = useState<number | null>(null);

  const limit = 20;

  const fetchBans = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      const response = await fetch(
        `/api/admin/moderation/bans?${params.toString()}`,
      );
      if (!response.ok) throw new Error('Failed to fetch banned users');
      const data = await response.json();
      setBans(data.bans || []);
      setTotal(data.total || 0);
    } catch (error) {
      logError('Failed to load banned users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBans();
  }, [page]);

  const handleUnban = async (userId: number) => {
    setUnbanningId(userId);
    try {
      const response = await fetch('/api/admin/account-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action: 'ACTIVE',
          reason: 'Ban lifted by moderator',
        }),
      });

      if (!response.ok) throw new Error('Failed to unban user');

      notifications.show({
        title: 'Success',
        message: 'User account has been reactivated.',
        color: 'green',
      });
      fetchBans();
    } catch (error) {
      logError('Failed to unban:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to lift ban.',
        color: 'red',
      });
    } finally {
      setUnbanningId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout
      title="Moderation: Ban Management"
      permission={PermissionType.MANAGE_ACCOUNT_STATUS}
    >
      <Stack gap="md">
        <GameCard title={`Active Penalties (${total})`}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : bans.length === 0 ? (
            <Text py="xl" ta="center" c="dimmed">
              No currently banned or suspended users.
            </Text>
          ) : (
            <Stack gap="md">
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User ID</Table.Th>
                      <Table.Th>User Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Penalty</Table.Th>
                      <Table.Th>Reason</Table.Th>
                      <Table.Th>Banned By</Table.Th>
                      <Table.Th>Starts At</Table.Th>
                      <Table.Th>Ends At</Table.Th>
                      <Table.Th>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {bans.map((ban) => (
                      <Table.Tr key={ban.id}>
                        <Table.Td>{ban.user_id}</Table.Td>
                        <Table.Td fw={700}>
                          {ban.user?.display_name || 'Deleted User'}
                        </Table.Td>
                        <Table.Td>{ban.user?.email || 'N/A'}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={ban.status === 'BANNED' ? 'red' : 'orange'}
                          >
                            {ban.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {ban.reason || 'No reason provided'}
                        </Table.Td>
                        <Table.Td>
                          {ban.admin?.display_name || 'System'}
                        </Table.Td>
                        <Table.Td>
                          {new Date(ban.start_date).toLocaleString()}
                        </Table.Td>
                        <Table.Td>
                          {ban.end_date
                            ? new Date(ban.end_date).toLocaleString()
                            : 'Permanent'}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            color="green"
                            onClick={() => handleUnban(ban.user_id)}
                            loading={unbanningId === ban.user_id}
                          >
                            Lift Penalty
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>

              {totalPages > 1 && (
                <Group justify="center" mt="md">
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                  />
                </Group>
              )}
            </Stack>
          )}
        </GameCard>
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
      ])),
    },
  };
};

export default BansDashboardPage;
