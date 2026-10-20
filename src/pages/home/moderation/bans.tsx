import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'next-i18next';
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
  const [fetchError, setFetchError] = useState(false);
  const [targetUserId, setTargetUserId] = useState<number | string>('');
  const [penalty, setPenalty] = useState<'BANNED' | 'SUSPENDED'>('BANNED');
  const [duration, setDuration] = useState<number | string>(7);
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<{
    userId: number;
    action: 'ACTIVE' | 'BANNED' | 'SUSPENDED';
    duration?: number;
    reason?: string;
  } | null>(null);
  const [savingAction, setSavingAction] = useState(false);
  const { t } = useTranslation('moderation-admin');

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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setBans(data.bans || []);
      setTotal(data.total || 0);
      setFetchError(false);
    } catch (error) {
      logError('Failed to load banned users:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBans();
  }, [page]);

  const handleAccountAction = async () => {
    if (!pendingAction) return;
    setSavingAction(true);
    if (pendingAction.action === 'ACTIVE') setUnbanningId(pendingAction.userId);
    try {
      const response = await fetch('/api/admin/account-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingAction),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      notifications.show({
        title: t('success'),
        message: t('actionCompleted'),
        color: 'green',
      });
      setPendingAction(null);
      await fetchBans();
    } catch (error) {
      logError('Failed to update account status:', error);
      notifications.show({
        title: t('error'),
        message: error instanceof Error ? error.message : t('requestFailed'),
        color: 'red',
      });
    } finally {
      setSavingAction(false);
      setUnbanningId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout
      title={t('banManagement')}
      permission={PermissionType.MANAGE_ACCOUNT_STATUS}
    >
      <Stack gap="md">
        <GameCard title={t('createPenalty')}>
          <Stack>
            <Group grow align="flex-end">
              <NumberInput
                label={t('targetUserId')}
                min={1}
                value={targetUserId}
                onChange={setTargetUserId}
              />
              <Select
                label={t('penalty')}
                data={[
                  { value: 'BANNED', label: t('ban') },
                  { value: 'SUSPENDED', label: t('suspend') },
                ]}
                value={penalty}
                onChange={(value) =>
                  value && setPenalty(value as 'BANNED' | 'SUSPENDED')
                }
              />
              <NumberInput
                label={t('durationDays')}
                min={1}
                max={3650}
                value={duration}
                onChange={setDuration}
              />
            </Group>
            <Textarea
              label={t('reason')}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                disabled={
                  !Number(targetUserId) || !Number(duration) || !reason.trim()
                }
                onClick={() =>
                  setPendingAction({
                    userId: Number(targetUserId),
                    action: penalty,
                    duration: Number(duration),
                    reason: reason.trim(),
                  })
                }
              >
                {t('reviewPenalty')}
              </Button>
            </Group>
          </Stack>
        </GameCard>
        <GameCard title={t('activePenalties', { count: total })}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : fetchError ? (
            <Stack align="center" py="xl">
              <Text role="alert" c="red">
                {t('loadFailed')}
              </Text>
              <Button onClick={fetchBans}>{t('retry')}</Button>
            </Stack>
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
                            onClick={() =>
                              setPendingAction({
                                userId: ban.user_id,
                                action: 'ACTIVE',
                                reason: t('liftReason'),
                              })
                            }
                            loading={unbanningId === ban.user_id}
                          >
                            {t('liftPenalty')}
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
      <Modal
        opened={!!pendingAction}
        onClose={() => !savingAction && setPendingAction(null)}
        title={t('confirmAccountAction')}
      >
        <Stack>
          <Text>
            {pendingAction?.action === 'ACTIVE'
              ? t('confirmLift', { userId: pendingAction.userId })
              : t('confirmPenalty', {
                  action: pendingAction?.action,
                  userId: pendingAction?.userId,
                  duration: pendingAction?.duration,
                  count: Number(pendingAction?.duration) || 0,
                })}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="outline"
              disabled={savingAction}
              onClick={() => setPendingAction(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              color={pendingAction?.action === 'ACTIVE' ? 'green' : 'red'}
              loading={savingAction}
              onClick={handleAccountAction}
            >
              {t('confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
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
        'moderation-admin',
      ])),
    },
  };
};

export default BansDashboardPage;
