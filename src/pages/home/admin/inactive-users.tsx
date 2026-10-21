import {
  Alert,
  Button,
  Checkbox,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { getAdminRequestError } from '@/utils/adminRequests';

type Notice = {
  warnedAt: string;
  scheduledDeletionAt: string;
  cancelledAt?: string;
  completedAt?: string;
};
type User = {
  id: number;
  display_name: string;
  last_active?: string;
  created_at?: string;
  accountInactivityNotice?: Notice;
  deliverableEmail?: boolean;
};
type Sweep = {
  reminders: number;
  anonymized: number;
  cancelled: number;
  failed: number;
  remindersEnabled: boolean;
  autoAnonymizeEnabled: boolean;
};
const InactiveUsersPage = () => {
  const { t, i18n } = useTranslation('admin-content');
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [confirm, setConfirm] = useState<'selected' | 'all' | 'sweep' | null>(
    null,
  );
  const date = (value?: string) =>
    value ? new Date(value).toLocaleDateString(i18n.language) : '—';
  const read = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(await getAdminRequestError(res));
    return res.json();
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await read(
        `/api/admin/users/inactive?page=${page}${status ? `&status=${status}` : ''}`,
      );
      setUsers(data.users);
      setTotal(data.total);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('emailAdmin.loadError'));
    } finally {
      setLoading(false);
    }
  }, [page, status, t]);
  const dryRun = useCallback(async () => {
    try {
      setSweep(await read('/api/admin/users/inactive-sweep'));
    } catch {
      setError(t('emailAdmin.loadError'));
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    dryRun();
  }, [dryRun]);
  const act = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await read(
        `/api/admin/users/${confirm === 'sweep' ? 'inactive-sweep' : 'inactive-notices'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            confirm === 'sweep'
              ? { dryRun: false }
              : {
                  all: confirm === 'all',
                  userIds: confirm === 'selected' ? selected : undefined,
                },
          ),
        },
      );
      setResult(
        String(
          confirm === 'sweep'
            ? t('emailAdmin.sweepResult', data)
            : t('emailAdmin.noticeResult', data),
        ),
      );
      setConfirm(null);
      await load();
      await dryRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('emailAdmin.error'));
    } finally {
      setBusy(false);
    }
  };
  const noticeLabel = (n?: Notice, deliverableEmail = true) =>
    !n
      ? t(
          deliverableEmail
            ? 'emailAdmin.none'
            : 'emailAdmin.noDeliverableEmail',
        )
      : n.completedAt
        ? t('emailAdmin.completed', { date: date(n.completedAt) })
        : n.cancelledAt
          ? t('emailAdmin.cancelled', { date: date(n.cancelledAt) })
          : t('emailAdmin.warned', {
              date: date(n.warnedAt),
              deletion: date(n.scheduledDeletionAt),
            });
  return (
    <AdminLayout
      title={t('emailAdmin.inactiveUsers')}
      permissions={['MANAGE_USERS']}
    >
      <Stack>
        <Text>{t('emailAdmin.inactiveIntro')}</Text>
        {error && (
          <Alert role="alert" color="red">
            {error}
          </Alert>
        )}
        {result && <Alert role="status">{result}</Alert>}
        <GameCard title={t('emailAdmin.dryRun')}>
          <Stack>
            {sweep ? (
              <>
                <Text>{t('emailAdmin.dryCounts', sweep)}</Text>
                <Text>
                  {t('emailAdmin.gates', {
                    reminders: t(
                      sweep.remindersEnabled
                        ? 'emailAdmin.enabled'
                        : 'emailAdmin.disabled',
                    ),
                    anonymize: t(
                      sweep.autoAnonymizeEnabled
                        ? 'emailAdmin.enabled'
                        : 'emailAdmin.disabled',
                    ),
                  })}
                </Text>
              </>
            ) : (
              <Text>{t('emailAdmin.loading')}</Text>
            )}
            <Group>
              <Button
                variant="default"
                disabled={busy}
                onClick={() => dryRun()}
              >
                {t('emailAdmin.refresh')}
              </Button>
              <Button
                disabled={busy || loading}
                onClick={() => setConfirm('sweep')}
              >
                {t('emailAdmin.runSweep')}
              </Button>
            </Group>
          </Stack>
        </GameCard>
        <GameCard title={t('emailAdmin.inactiveUsers')}>
          <Stack>
            <Select
              label={t('emailAdmin.noticeStatus')}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              clearable
              data={['none', 'warned', 'cancelled', 'completed'].map(
                (value) => ({ value, label: t(`emailAdmin.filters.${value}`) }),
              )}
            />
            <Group>
              <Button
                disabled={busy || loading || !selected.length}
                onClick={() => setConfirm('selected')}
              >
                {t('emailAdmin.sendSelected', { count: selected.length })}
              </Button>
              <Button
                variant="default"
                disabled={busy || loading}
                onClick={() => setConfirm('all')}
              >
                {t('emailAdmin.sendAllUnnoticed')}
              </Button>
            </Group>
            <AdminDataTable
              ariaLabel={t('emailAdmin.inactiveUsers')}
              aria-busy={loading}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Checkbox
                      aria-label={t('emailAdmin.selectPage')}
                      checked={
                        users.length > 0 && selected.length === users.length
                      }
                      indeterminate={
                        selected.length > 0 && selected.length < users.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.currentTarget.checked ? users.map((u) => u.id) : [],
                        )
                      }
                    />
                  </Table.Th>
                  {['name', 'lastActive', 'created', 'noticeStatus'].map(
                    (key) => (
                      <Table.Th key={key}>{t(`emailAdmin.${key}`)}</Table.Th>
                    ),
                  )}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>
                      <Checkbox
                        aria-label={t('emailAdmin.selectUser', {
                          name: u.display_name,
                        })}
                        checked={selected.includes(u.id)}
                        onChange={(e) =>
                          setSelected(
                            e.currentTarget.checked
                              ? [...selected, u.id]
                              : selected.filter((id) => id !== u.id),
                          )
                        }
                      />
                    </Table.Td>
                    <Table.Td>{u.display_name}</Table.Td>
                    <Table.Td>{date(u.last_active)}</Table.Td>
                    <Table.Td>{date(u.created_at)}</Table.Td>
                    <Table.Td>
                      {noticeLabel(
                        u.accountInactivityNotice,
                        u.deliverableEmail,
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {!users.length && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      {t(loading ? 'emailAdmin.loading' : 'emailAdmin.empty')}
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </AdminDataTable>
            <Pagination
              value={page}
              onChange={setPage}
              total={Math.max(1, Math.ceil(total / 50))}
              disabled={loading || busy}
            />
          </Stack>
        </GameCard>
        <ConfirmationModal
          isOpen={!!confirm}
          onClose={() => !busy && setConfirm(null)}
          onConfirm={() => act()}
          title={t('emailAdmin.confirm')}
          message={t(
            confirm === 'sweep'
              ? 'emailAdmin.confirmSweep'
              : confirm === 'all'
                ? 'emailAdmin.confirmAllNotices'
                : 'emailAdmin.confirmNotices',
            { count: selected.length },
          )}
          type={confirm === 'sweep' ? 'destructive' : 'primary'}
          confirmText={t('emailAdmin.confirm')}
          cancelText={t('emailAdmin.cancel')}
          isLoading={busy}
        >
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
        </ConfirmationModal>
      </Stack>
    </AdminLayout>
  );
};
export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-content',
    ])),
  },
});
export default InactiveUsersPage;
