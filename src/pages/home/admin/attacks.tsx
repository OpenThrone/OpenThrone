import {
  Alert,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useRef, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import CombatDetails from '@/components/admin/CombatDetails';
import type { adminCombatDetails } from '@/utils/adminCombat';
import { logError } from '@/utils/logger';

interface Attack {
  id: number;
  timestamp: string | null;
  type: string;
  winner: number;
  attackerPlayer: { id: number; display_name: string };
  defenderPlayer: { id: number; display_name: string };
  pillaged_gold: string | null;
  attacker_losses_total: number | null;
  defender_losses_total: number | null;
}
export default function AttacksPage() {
  const { t } = useTranslation('admin-activity');
  const router = useRouter();
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const [player, setPlayer] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ logs: Attack[]; total: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<
    (Attack & { details: ReturnType<typeof adminCombatDetails> }) | null
  >(null);
  const [detailError, setDetailError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const id = Number(router.query.attackId);
    if (Number.isSafeInteger(id) && id > 0) setSelected(id);
  }, [router.query.attackId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    fetch(`/api/admin/attacks?page=${page}&${filters}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          logError('Attack ledger failed', cause);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, retry]);
  useEffect(() => {
    detailHeading.current?.focus();
    setDetail(null);
    setDetailError(false);
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/admin/attacks?id=${selected}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setDetail(await res.json());
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          logError('Attack details failed', cause);
          setDetailError(true);
        }
      });
    return () => controller.abort();
  }, [selected, retry]);
  return (
    <AdminLayout title={t('attackLedger')} permissions={['VIEW_ANALYTICS']}>
      <Stack>
        <Text c="dimmed" size="sm">
          {t('ledgerDescription')}
        </Text>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const params = new URLSearchParams();
            if (player) params.set('playerId', player);
            if (type) params.set('type', type);
            if (from)
              params.set('from', new Date(`${from}T00:00:00Z`).toISOString());
            if (to)
              params.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
            setPage(1);
            setSelected(null);
            setFilters(params.toString());
          }}
        >
          <Group align="end">
            <TextInput
              label={t('playerId')}
              type="number"
              min={1}
              value={player}
              onChange={(e) => setPlayer(e.currentTarget.value)}
              w={{ base: '100%', sm: 130 }}
            />
            <Select
              label={t('mission')}
              clearable
              value={type}
              onChange={setType}
              data={['attack', 'INTEL', 'ASSASSINATE', 'INFILTRATE'].map(
                (value) => ({ value, label: t(`actions.${value}`) }),
              )}
            />
            <TextInput
              type="date"
              label={t('fromUTC')}
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.currentTarget.value)}
            />
            <TextInput
              type="date"
              label={t('toUTC')}
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.currentTarget.value)}
            />
            <Button type="submit">{t('apply')}</Button>
            <Button
              variant="default"
              onClick={() => {
                setPlayer('');
                setType(null);
                setFrom('');
                setTo('');
                setPage(1);
                setFilters('');
                setSelected(null);
              }}
            >
              {t('clear')}
            </Button>
          </Group>
        </form>
        {error && (
          <Alert color="red" role="alert">
            {t('loadError')}{' '}
            <Button variant="default" onClick={() => setRetry((v) => v + 1)}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        {loading ? (
          <Loader aria-label={t('loading')} />
        ) : (
          data && (
            <>
              <Text size="sm">{t('recordCount', { count: data.total })}</Text>
              <AdminDataTable
                size="wide"
                ariaLabel={t('attackLedger')}
                withTableBorder
              >
                <Table.Thead>
                  <Table.Tr>
                    {[
                      'id',
                      'time',
                      'mission',
                      'attacker',
                      'defender',
                      'winner',
                      'gold',
                      'attackerLosses',
                      'defenderLosses',
                      'details',
                    ].map((key) => (
                      <Table.Th key={key}>{t(key)}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.logs.map((log) => (
                    <Table.Tr key={log.id}>
                      <Table.Td>#{log.id}</Table.Td>
                      <Table.Td>
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString()
                          : t('notRecorded')}
                      </Table.Td>
                      <Table.Td>
                        {t(`actions.${log.type}`, { defaultValue: log.type })}
                      </Table.Td>
                      <Table.Td>
                        {log.attackerPlayer.display_name} (#
                        {log.attackerPlayer.id})
                      </Table.Td>
                      <Table.Td>
                        {log.defenderPlayer.display_name} (#
                        {log.defenderPlayer.id})
                      </Table.Td>
                      <Table.Td>
                        {log.winner === log.attackerPlayer.id
                          ? log.attackerPlayer.display_name
                          : log.winner === log.defenderPlayer.id
                            ? log.defenderPlayer.display_name
                            : t('notRecorded')}
                      </Table.Td>
                      <Table.Td>
                        {log.pillaged_gold ?? t('notRecorded')}
                      </Table.Td>
                      <Table.Td>
                        {log.attacker_losses_total ?? t('notRecorded')}
                      </Table.Td>
                      <Table.Td>
                        {log.defender_losses_total ?? t('notRecorded')}
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() => setSelected(log.id)}
                          aria-label={t('viewAttack', { id: log.id })}
                        >
                          {t('details')}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AdminDataTable>
              {!data.total && <Text c="dimmed">{t('empty')}</Text>}
              {data.total > 50 && (
                <Pagination
                  value={page}
                  onChange={setPage}
                  total={Math.ceil(data.total / 50)}
                />
              )}
            </>
          )
        )}
        {selected && (
          <section aria-label={t('attackDetails')}>
            <Stack>
              <Group justify="space-between">
                <Title order={2} ref={detailHeading} tabIndex={-1}>
                  {t('attackNumber', { id: selected })}
                </Title>
                <Button variant="default" onClick={() => setSelected(null)}>
                  {t('closeDetails')}
                </Button>
              </Group>
              {detailError ? (
                <Alert color="red" role="alert">
                  {t('loadError')}{' '}
                  <Button
                    variant="default"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    {t('retry')}
                  </Button>
                </Alert>
              ) : detail ? (
                <CombatDetails details={detail.details} />
              ) : (
                <Loader aria-label={t('loading')} />
              )}
            </Stack>
          </section>
        )}
      </Stack>
    </AdminLayout>
  );
}
export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-activity',
    ])),
  },
});
