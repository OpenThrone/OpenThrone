import {
  Alert,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
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
type VeteranRecord = {
  id: number;
  title: string;
  sourceUserId: number | null;
  originalJoinedAt: string;
  recordedAt: string;
  expiresAt: string | null;
  claimedByUserId: number | null;
  claimedAt: string | null;
};
const TEMPLATES = ['STANDARD', 'ERA_RELAUNCH'] as const;
const InactiveUsersPage = () => {
  const { t, i18n } = useTranslation('admin-content');
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [inactiveSince, setInactiveSince] = useState('');
  const [noticeDays, setNoticeDays] = useState<number | ''>(180);
  const [template, setTemplate] =
    useState<(typeof TEMPLATES)[number]>('STANDARD');
  const [newsPostId, setNewsPostId] = useState<number | ''>('');
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [veterans, setVeterans] = useState<VeteranRecord[]>([]);
  const [veteransTotal, setVeteransTotal] = useState(0);
  const [veteransPage, setVeteransPage] = useState(1);
  const [veteransLoading, setVeteransLoading] = useState(false);
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
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (inactiveSince) {
        const parsed = new Date(inactiveSince);
        if (!Number.isNaN(parsed.getTime()))
          params.set('inactiveSince', parsed.toISOString());
      }
      const data = await read(`/api/admin/users/inactive?${params}`);
      setUsers(data.users);
      setTotal(data.total);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('emailAdmin.loadError'));
    } finally {
      setLoading(false);
    }
  }, [page, status, inactiveSince, t]);
  const loadVeterans = useCallback(async () => {
    setVeteransLoading(true);
    try {
      const data = await read(`/api/admin/users/veterans?page=${veteransPage}`);
      setVeterans(data.records);
      setVeteransTotal(data.total);
    } catch {
      setVeterans([]);
      setVeteransTotal(0);
    } finally {
      setVeteransLoading(false);
    }
  }, [veteransPage]);
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
  useEffect(() => {
    loadVeterans();
  }, [loadVeterans]);
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
                  ...(inactiveSince
                    ? { inactiveSince: new Date(inactiveSince).toISOString() }
                    : {}),
                  noticeDays: noticeDays === '' ? 180 : noticeDays,
                  template,
                  ...(newsPostId === '' ? {} : { newsPostId }),
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
  // The deadline the next notice batch will write, shown before sending.
  const deadlineDate =
    noticeDays === ''
      ? '—'
      : new Date(
          Date.now() + (noticeDays as number) * 86_400_000,
        ).toLocaleDateString(i18n.language);
  const templateLabel = t(`emailAdmin.templates.${template}`);
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
            <Group grow align="flex-start">
              <TextInput
                label={t('emailAdmin.inactiveSince')}
                description={t('emailAdmin.inactiveSinceHelp')}
                placeholder="2026-10-01"
                value={inactiveSince}
                onChange={(event) => {
                  setInactiveSince(event.currentTarget.value);
                  setPage(1);
                }}
              />
              <NumberInput
                label={t('emailAdmin.noticeDays')}
                description={t('emailAdmin.noticeDaysHelp')}
                value={noticeDays}
                min={14}
                max={365}
                step={1}
                allowDecimal={false}
                onChange={(value) =>
                  setNoticeDays(value === '' ? '' : Number(value))
                }
              />
              <Select
                label={t('emailAdmin.template')}
                value={template}
                onChange={(v) =>
                  setTemplate((v ?? 'STANDARD') as typeof template)
                }
                allowDeselect={false}
                data={TEMPLATES.map((value) => ({
                  value,
                  label: t(`emailAdmin.templates.${value}`),
                }))}
              />
              <NumberInput
                label={t('emailAdmin.newsPostId')}
                description={t('emailAdmin.newsPostIdHelp')}
                value={newsPostId}
                min={1}
                allowDecimal={false}
                hideControls
                onChange={(value) =>
                  setNewsPostId(value === '' ? '' : Number(value))
                }
              />
            </Group>
            <Text size="sm" c="dimmed">
              {t('emailAdmin.audienceCount', {
                count: total,
                deadline: deadlineDate,
                template: templateLabel,
              })}
            </Text>
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
        <GameCard title={t('emailAdmin.veteranRecords')}>
          <Stack>
            <Text size="sm" c="dimmed">
              {t('emailAdmin.veteranIntro')}
            </Text>
            <AdminDataTable
              ariaLabel={t('emailAdmin.veteranRecords')}
              aria-busy={veteransLoading}
            >
              <Table.Thead>
                <Table.Tr>
                  {[
                    'veteranId',
                    'veteranTitle',
                    'veteranJoined',
                    'veteranRecorded',
                    'veteranExpires',
                    'veteranClaimed',
                  ].map((key) => (
                    <Table.Th key={key}>{t(`emailAdmin.${key}`)}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {veterans.map((record) => (
                  <Table.Tr key={record.id}>
                    <Table.Td>{record.id}</Table.Td>
                    <Table.Td>
                      {t(`emailAdmin.veteranTitles.${record.title}`)}
                    </Table.Td>
                    <Table.Td>{date(record.originalJoinedAt)}</Table.Td>
                    <Table.Td>{date(record.recordedAt)}</Table.Td>
                    <Table.Td>{date(record.expiresAt ?? undefined)}</Table.Td>
                    <Table.Td>
                      {record.claimedByUserId
                        ? t('emailAdmin.veteranClaimedBy', {
                            id: record.claimedByUserId,
                            date: date(record.claimedAt ?? undefined),
                          })
                        : t('emailAdmin.veteranUnclaimed')}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {!veterans.length && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      {t(
                        veteransLoading
                          ? 'emailAdmin.loading'
                          : 'emailAdmin.empty',
                      )}
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </AdminDataTable>
            <Pagination
              value={veteransPage}
              onChange={setVeteransPage}
              total={Math.max(1, Math.ceil(veteransTotal / 50))}
              disabled={veteransLoading}
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
            {
              count: selected.length,
              deadline: deadlineDate,
              template: templateLabel,
            },
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
