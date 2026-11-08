import {
  Button,
  Group,
  Modal,
  Pagination,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import type { GetServerSidePropsContext } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';

type Kind =
  | 'transfers'
  | 'recruits'
  | 'logins'
  | 'drift'
  | 'suppressions'
  | 'blocks';
type Row = Record<string, string | number | boolean | null>;
type Result = {
  rows: Row[];
  total: number;
  pairs: { from: number; to: number; amount: string; count: number }[];
};
const config = {
  transfers: {
    permission: 'VIEW_ECONOMY',
    columns: ['id', 'from_user_id', 'to_user_id', 'gold_amount', 'date_time'],
  },
  recruits: {
    permission: 'VIEW_ANALYTICS',
    columns: ['id', 'to_user', 'from_user', 'source', 'timestamp'],
  },
  logins: {
    permission: 'VIEW_MULTI_ACCOUNTS',
    columns: [
      'id',
      'userId',
      'occurredAt',
      'ipHash',
      'ipPrefixHash',
      'userAgentHash',
      'deviceHash',
    ],
  },
  drift: {
    permission: 'VIEW_ECONOMY',
    columns: [
      'id',
      'userId',
      'type',
      'usage',
      'level',
      'checkpointQuantity',
      'ledgerDelta',
      'actualQuantity',
      'drift',
      'createdAt',
    ],
  },
  suppressions: {
    permission: 'SEND_MASS_MESSAGES',
    columns: ['id', 'hash', 'reason', 'createdAt', 'createdByUserId'],
  },
  blocks: {
    permission: 'MANAGE_ACCOUNT_STATUS',
    columns: [
      'id',
      'kind',
      'hash',
      'reason',
      'sourceUserId',
      'createdAt',
      'expiresAt',
    ],
  },
} as const;
const kinds = Object.keys(config) as Kind[];

export default function LedgersPage() {
  const { t } = useTranslation('admin-ledgers');
  const { user } = useUser();
  const allowed = kinds.filter((kind) =>
    user?.permissions?.some((p) => p.type === config[kind].permission),
  );
  const [kind, setKind] = useState<Kind | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!kind && allowed.length) setKind(allowed[0]);
  }, [kind, allowed]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!kind || (kind === 'logins' && !from)) {
        setResult(null);
        return;
      }
      const params = new URLSearchParams({ page: String(page) });
      if (from && ['transfers', 'recruits', 'logins', 'drift'].includes(kind))
        params.set('from', from);
      if (to && ['transfers', 'recruits'].includes(kind)) params.set('to', to);
      if (start && !['suppressions', 'blocks'].includes(kind))
        params.set('start', start);
      if (end && !['suppressions', 'blocks'].includes(kind))
        params.set('end', end);
      if (search && ['suppressions', 'blocks'].includes(kind))
        params.set('search', search);
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/admin/ledgers/${kind}?${params}`, {
          signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setResult(await response.json());
      } catch (err) {
        if (!signal.aborted) {
          logError('Failed to load ledger', err);
          setError(true);
          setResult(null);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [kind, from, to, start, end, search, page, revision],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const changeKind = (value: string | null) => {
    // Re-selecting the open tab must not clear results it will not reload.
    if (value === kind) return;
    setKind(value as Kind | null);
    setFrom('');
    setTo('');
    setStart('');
    setEnd('');
    setSearch('');
    setPage(1);
    setResult(null);
  };
  const remove = async () => {
    if (!kind || pending === null || removing) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/admin/ledgers/${kind}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pending }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPending(null);
      setRevision((value) => value + 1);
    } catch (err) {
      logError('Failed to remove ledger entry', err);
      setError(true);
    } finally {
      setRemoving(false);
    }
  };
  const filter =
    (setter: (value: string) => void) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setter(event.currentTarget.value);
      setPage(1);
    };
  return (
    <AdminLayout
      title={t('title')}
      permissions={[
        'VIEW_ECONOMY',
        'VIEW_ANALYTICS',
        'VIEW_MULTI_ACCOUNTS',
        'SEND_MASS_MESSAGES',
        'MANAGE_ACCOUNT_STATUS',
      ]}
    >
      <Stack>
        <Tabs value={kind} onChange={changeKind}>
          <Tabs.List>
            {allowed.map((item) => (
              <Tabs.Tab key={item} value={item}>
                {t(`tabs.${item}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        {kind && (
          <>
            {kind === 'blocks' && <Text size="sm">{t('blockWarning')}</Text>}
            {kind === 'suppressions' && (
              <Text size="sm">{t('suppressionWarning')}</Text>
            )}
            {kind === 'logins' && <Text size="sm">{t('loginNote')}</Text>}
            {kind === 'drift' && <Text size="sm">{t('driftNote')}</Text>}
            <Group align="end">
              {['transfers', 'recruits', 'logins', 'drift'].includes(kind) && (
                <TextInput
                  label={t(
                    kind === 'transfers'
                      ? 'sender'
                      : kind === 'recruits'
                        ? 'recruiter'
                        : 'userId',
                  )}
                  type="number"
                  min={1}
                  value={from}
                  onChange={filter(setFrom)}
                />
              )}
              {['transfers', 'recruits'].includes(kind) && (
                <TextInput
                  label={t(kind === 'transfers' ? 'receiver' : 'recruited')}
                  type="number"
                  min={1}
                  value={to}
                  onChange={filter(setTo)}
                />
              )}
              {!['suppressions', 'blocks'].includes(kind) && (
                <>
                  <TextInput
                    label={t('start')}
                    type="date"
                    value={start}
                    onChange={filter(setStart)}
                  />
                  <TextInput
                    label={t('end')}
                    type="date"
                    value={end}
                    onChange={filter(setEnd)}
                  />
                </>
              )}
              {['suppressions', 'blocks'].includes(kind) && (
                <TextInput
                  label={t('searchHash')}
                  value={search}
                  onChange={filter(setSearch)}
                />
              )}
            </Group>
            {kind === 'logins' && !from && <Text>{t('enterUser')}</Text>}
            {loading && <Text role="status">{t('loading')}</Text>}
            {error && (
              <Text c="red" role="alert">
                {t('error')}
              </Text>
            )}
            {result && (
              <>
                <Text>{t('count', { count: result.total })}</Text>
                <AdminDataTable>
                  <Table.Thead>
                    <Table.Tr>
                      {config[kind].columns.map((column) => (
                        <Table.Th key={column}>
                          {t(`columns.${column}`)}
                        </Table.Th>
                      ))}
                      {['suppressions', 'blocks'].includes(kind) && (
                        <Table.Th>{t('action')}</Table.Th>
                      )}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.map((row) => (
                      <Table.Tr key={String(row.id)}>
                        {config[kind].columns.map((column) => (
                          <Table.Td
                            key={column}
                            style={{
                              overflowWrap:
                                kind === 'drift' ? 'normal' : 'anywhere',
                            }}
                          >
                            {String(row[column] ?? '—')}
                          </Table.Td>
                        ))}
                        {['suppressions', 'blocks'].includes(kind) && (
                          <Table.Td>
                            <Tooltip
                              label={t('protectedRemoval')}
                              disabled={row.removable === true}
                            >
                              <span>
                                <Button
                                  size="xs"
                                  color="red"
                                  disabled={row.removable !== true}
                                  onClick={() => setPending(Number(row.id))}
                                >
                                  {t('remove')}
                                </Button>
                              </span>
                            </Tooltip>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
                {kind === 'transfers' && result.pairs.length > 0 && (
                  <>
                    <Text fw={700}>{t('pairTotals')}</Text>
                    <AdminDataTable>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t('sender')}</Table.Th>
                          <Table.Th>{t('receiver')}</Table.Th>
                          <Table.Th>{t('totalGold')}</Table.Th>
                          <Table.Th>{t('transfersCount')}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {result.pairs.map((pair) => (
                          <Table.Tr key={`${pair.from}:${pair.to}`}>
                            <Table.Td>{pair.from}</Table.Td>
                            <Table.Td>{pair.to}</Table.Td>
                            <Table.Td>{pair.amount}</Table.Td>
                            <Table.Td>{pair.count}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </AdminDataTable>
                  </>
                )}
                {result.total > 25 && (
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={Math.ceil(result.total / 25)}
                  />
                )}
              </>
            )}
          </>
        )}
        <Modal
          opened={pending !== null}
          onClose={() => !removing && setPending(null)}
          title={t('confirmTitle')}
        >
          <Stack>
            <Text>
              {t(kind === 'blocks' ? 'blockWarning' : 'suppressionWarning')}
            </Text>
            <Group justify="end">
              <Button
                variant="default"
                onClick={() => setPending(null)}
                disabled={removing}
              >
                {t('cancel')}
              </Button>
              <Button color="red" loading={removing} onClick={remove}>
                {t('remove')}
              </Button>
            </Group>
          </Stack>
        </Modal>
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
      'admin-ledgers',
    ])),
  },
});
