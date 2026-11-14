import {
  Badge,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { GetServerSidePropsContext } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from '@/utils/serverTranslations';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';

type CronRunRow = {
  id: number;
  job: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  /** RUNNING for longer than the server's stale threshold (2h). */
  stale: boolean;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
};

type LastSuccessRow = {
  job: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

type Result = {
  rows: CronRunRow[];
  total: number;
  jobs: string[];
  lastSuccess: LastSuccessRow[];
};

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ['RUNNING', 'SUCCESS', 'FAILED'] as const;

const STATUS_COLORS: Record<CronRunRow['status'] | 'STALE', string> = {
  STALE: 'gray',
  FAILED: 'red',
  RUNNING: 'yellow',
  SUCCESS: 'green',
};

/** Failed runs: a red wash on the dark surface plus a left rule, so they stand out without relying on colour alone (the Failed badge repeats it). */
const FAILED_ROW_STYLE = {
  background:
    'color-mix(in srgb, var(--mantine-color-red-8) 40%, var(--ot-surface))',
  boxShadow: 'inset 3px 0 0 var(--mantine-color-red-5)',
} as const;

/** Stable UTC rendering; the page renders data client-side only. */
const formatDate = (value: string | null) =>
  value
    ? `${new Date(value).toISOString().slice(0, 19).replace('T', ' ')} UTC`
    : '—';

const formatDuration = (value: number | null) =>
  value === null ? '—' : `${value} ms`;

const formatSummary = (summary: Record<string, unknown> | null) =>
  summary && Object.keys(summary).length
    ? Object.entries(summary)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join('  ')
    : '—';

export default function CronRunsPage() {
  const { t } = useTranslation('admin-cron-runs');
  const { user } = useUser();
  const allowed =
    user?.permissions?.some((p) => p.type === 'MANAGE_SERVER_SETTINGS') ??
    false;
  const [job, setJob] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!allowed) return;
      const params = new URLSearchParams({ page: String(page) });
      if (job) params.set('job', job);
      if (status) params.set('status', status);
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/admin/cron-runs?${params}`, {
          signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setResult(await response.json());
      } catch (err) {
        if (!signal.aborted) {
          logError('Failed to load cron runs', err);
          setError(true);
          setResult(null);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [allowed, job, status, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const changeFilter =
    (setter: (value: string | null) => void) => (value: string | null) => {
      setter(value || null);
      setPage(1);
    };

  return (
    <AdminLayout title={t('title')} permissions={['MANAGE_SERVER_SETTINGS']}>
      <Stack>
        <Text size="sm" c="dimmed">
          {t('intro')}
        </Text>
        <Group align="end">
          <Select
            label={t('jobFilter')}
            placeholder={t('allJobs')}
            data={(result?.jobs ?? []).map((name) => ({
              value: name,
              label: name,
            }))}
            value={job}
            onChange={changeFilter(setJob)}
            clearable
            searchable
            w={220}
          />
          <Select
            label={t('statusFilter')}
            placeholder={t('allStatuses')}
            data={STATUS_OPTIONS.map((value) => ({
              value,
              label: t(`status.${value}`),
            }))}
            value={status}
            onChange={changeFilter(setStatus)}
            clearable
            w={180}
          />
        </Group>
        {loading && <Text role="status">{t('loading')}</Text>}
        {error && (
          <Text c="red" role="alert">
            {t('error')}
          </Text>
        )}
        {result && (
          <>
            {result.lastSuccess.length > 0 && (
              <>
                <Text fw={700}>{t('lastSuccess')}</Text>
                <AdminDataTable size="compact" ariaLabel={t('lastSuccess')}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('columns.job')}</Table.Th>
                      <Table.Th>{t('columns.startedAt')}</Table.Th>
                      <Table.Th>{t('columns.duration')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.lastSuccess.map((row) => (
                      <Table.Tr key={row.job}>
                        <Table.Td>{row.job}</Table.Td>
                        <Table.Td>{formatDate(row.startedAt)}</Table.Td>
                        <Table.Td>{formatDuration(row.durationMs)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
              </>
            )}
            <Text>{t('count', { count: result.total })}</Text>
            <AdminDataTable size="wide" ariaLabel={t('title')}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('columns.id')}</Table.Th>
                  <Table.Th>{t('columns.job')}</Table.Th>
                  <Table.Th>{t('columns.status')}</Table.Th>
                  <Table.Th>{t('columns.startedAt')}</Table.Th>
                  <Table.Th>{t('columns.finishedAt')}</Table.Th>
                  <Table.Th>{t('columns.duration')}</Table.Th>
                  <Table.Th>{t('columns.summary')}</Table.Th>
                  <Table.Th>{t('columns.error')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.rows.map((row) => (
                  <Table.Tr
                    key={row.id}
                    data-testid={`cron-run-${row.id}`}
                    style={
                      row.status === 'FAILED' ? FAILED_ROW_STYLE : undefined
                    }
                  >
                    <Table.Td>{row.id}</Table.Td>
                    <Table.Td>{row.job}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <Badge
                        styles={{
                          root: { maxWidth: 'none', overflow: 'visible' },
                          label: { overflow: 'visible', textOverflow: 'clip' },
                        }}
                        color={STATUS_COLORS[row.stale ? 'STALE' : row.status]}
                        variant={row.status === 'FAILED' ? 'filled' : 'light'}
                      >
                        {t(`status.${row.stale ? 'STALE' : row.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatDate(row.startedAt)}</Table.Td>
                    <Table.Td>{formatDate(row.finishedAt)}</Table.Td>
                    <Table.Td>{formatDuration(row.durationMs)}</Table.Td>
                    <Table.Td style={{ overflowWrap: 'anywhere' }}>
                      {formatSummary(row.summary)}
                    </Table.Td>
                    <Table.Td
                      c={row.error ? 'red' : undefined}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {row.error ?? '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AdminDataTable>
            {result.total > PAGE_SIZE && (
              <Pagination
                value={page}
                onChange={setPage}
                total={Math.ceil(result.total / PAGE_SIZE)}
              />
            )}
          </>
        )}
      </Stack>
    </AdminLayout>
  );
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => ({
  props: {
    ...(await serverSideTranslations(context.locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-cron-runs',
    ])),
  },
});
