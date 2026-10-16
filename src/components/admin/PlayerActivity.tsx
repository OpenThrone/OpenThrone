import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';

import tableClasses from '@/components/admin/AdminDataTable.module.css';
import DateSortHeader from '@/components/admin/DateSortHeader';
import TablePagination from '@/components/admin/TablePagination';
import { logError } from '@/utils/logger';

const CATEGORIES = [
  'training',
  'recruiting',
  'equipment',
  'upgrades',
  'banking',
  'combat',
  'social',
  'other',
];
interface ActivityData {
  total: number;
  activePlayers: number;
  breakdown: { category: string; actions: number; players: number }[];
  players: {
    actor: number;
    display_name: string;
    category: string;
    actions: number;
    last_at: string;
  }[];
  recent: {
    key: string;
    actor: number;
    display_name: string;
    at: string;
    category: string;
    action: string;
    gold: string | null;
    target: number | null;
    attack_id: number | null;
  }[];
}

export default function PlayerActivity({ days }: { days: string }) {
  const { t } = useTranslation('admin-activity');
  const router = useRouter();
  const [player, setPlayer] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [playerPage, setPlayerPage] = useState(1);
  const [playerPageSize, setPlayerPageSize] = useState(10);
  const [playerSortDirection, setPlayerSortDirection] = useState<
    'asc' | 'desc'
  >('desc');
  useEffect(() => {
    setPlayerPage(1);
  }, [days, category, playerId]);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const id = Number(router.query.playerId);
    if (Number.isSafeInteger(id) && id > 0) {
      setPlayer(String(id));
      setPlayerId(String(id));
      setPage(1);
    }
  }, [router.query.playerId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    const params = new URLSearchParams({
      days,
      page: String(page),
      pageSize: String(pageSize),
      sortDirection,
      playerPage: String(playerPage),
      playerPageSize: String(playerPageSize),
      playerSortDirection,
    });
    if (playerId) params.set('playerId', playerId);
    if (category) params.set('category', category);
    fetch(`/api/admin/analytics/activity?${params}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const result: ActivityData = await res.json();
        if (!controller.signal.aborted) {
          setData(result);
          setPlayerPage((current) =>
            Math.min(
              current,
              Math.max(1, Math.ceil(result.activePlayers / playerPageSize)),
            ),
          );
          setPage((current) =>
            Math.min(current, Math.max(1, Math.ceil(result.total / pageSize))),
          );
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          logError('Player activity failed', cause);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    days,
    page,
    pageSize,
    sortDirection,
    playerPage,
    playerPageSize,
    playerSortDirection,
    category,
    playerId,
    retry,
  ]);
  const players = useMemo(() => {
    const rows = new Map<
      number,
      {
        id: number;
        name: string;
        total: number;
        lastAt: number;
        counts: Record<string, number>;
      }
    >();
    for (const row of data?.players ?? []) {
      const current = rows.get(row.actor) ?? {
        id: row.actor,
        name: row.display_name,
        total: 0,
        lastAt: 0,
        counts: {},
      };
      current.total += row.actions;
      current.lastAt = Math.max(
        current.lastAt,
        new Date(row.last_at).getTime(),
      );
      current.counts[row.category] = row.actions;
      rows.set(row.actor, current);
    }
    return [...rows.values()].sort(
      (a, b) =>
        (playerSortDirection === 'asc'
          ? a.lastAt - b.lastAt
          : b.lastAt - a.lastAt) || a.id - b.id,
    );
  }, [data, playerSortDirection]);
  return (
    <Stack gap="md">
      <Title order={2}>{t('playerActivity')}</Title>
      <Text size="sm" c="dimmed">
        {t('activityDescription')}
      </Text>
      <Text size="sm" c="dimmed">
        {t('coverageNote')}
      </Text>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setPlayerId(player);
        }}
      >
        <Group align="end">
          <TextInput
            type="number"
            min={1}
            label={t('playerId')}
            value={player}
            onChange={(e) => setPlayer(e.currentTarget.value)}
          />
          <Select
            clearable
            label={t('category')}
            value={category}
            onChange={(value) => {
              setPage(1);
              setCategory(value);
            }}
            data={CATEGORIES.map((value) => ({
              value,
              label: t(`categories.${value}`),
            }))}
          />
          <Button type="submit">{t('apply')}</Button>
          <Button
            variant="default"
            onClick={() => {
              setPlayer('');
              setPlayerId('');
              setCategory(null);
              setPage(1);
            }}
          >
            {t('clear')}
          </Button>
        </Group>
      </form>
      {error && (
        <Alert color="red" role="alert">
          {t('loadError')}{' '}
          <Button onClick={() => setRetry((value) => value + 1)}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {loading ? (
        <Loader aria-label={t('loading')} />
      ) : (
        data && (
          <>
            <Text>
              {t('activityTotals', {
                actions: data.total.toLocaleString(),
                players: data.activePlayers.toLocaleString(),
              })}
            </Text>
            <Table.ScrollContainer minWidth={400}>
              <Table
                className={tableClasses.table}
                striped
                highlightOnHover
                withTableBorder
              >
                <Table.Thead>
                  <Table.Tr>
                    {['category', 'actionsCount', 'players'].map((key) => (
                      <Table.Th key={key}>{t(key)}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.breakdown.map((row) => (
                    <Table.Tr key={row.category}>
                      <Table.Th>{t(`categories.${row.category}`)}</Table.Th>
                      <Table.Td>{row.actions.toLocaleString()}</Table.Td>
                      <Table.Td>{row.players.toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Title order={3}>{t('playerBreakdown')}</Title>
            <Text size="sm" c="dimmed">
              {t('topPlayersNote')}
            </Text>
            <Table.ScrollContainer minWidth={1000}>
              <Table
                className={tableClasses.table}
                striped
                highlightOnHover
                withTableBorder
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('player')}</Table.Th>
                    <DateSortHeader
                      label={t('lastActivity')}
                      direction={playerSortDirection}
                      onToggle={() => {
                        setPlayerSortDirection((value) =>
                          value === 'asc' ? 'desc' : 'asc',
                        );
                        setPlayerPage(1);
                      }}
                    />
                    {CATEGORIES.map((key) => (
                      <Table.Th key={key}>{t(`categories.${key}`)}</Table.Th>
                    ))}
                    <Table.Th>{t('total')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {players.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          onClick={() => {
                            setPlayer(String(row.id));
                            setPlayerId(String(row.id));
                            setPage(1);
                          }}
                        >
                          {row.name} (#{row.id})
                        </Button>
                      </Table.Td>
                      <Table.Td>
                        {new Date(row.lastAt).toLocaleString()}
                      </Table.Td>
                      {CATEGORIES.map((key) => (
                        <Table.Td key={key}>
                          {(row.counts[key] ?? 0).toLocaleString()}
                        </Table.Td>
                      ))}
                      <Table.Td>{row.total.toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <TablePagination
              label={t('playerBreakdown')}
              page={playerPage}
              pageSize={playerPageSize}
              total={data.activePlayers}
              onPageChange={setPlayerPage}
              onPageSizeChange={(value) => {
                setPlayerPageSize(value);
                setPlayerPage(1);
              }}
            />
            <Title order={3}>{t('timeline')}</Title>
            <TablePagination
              label={t('timeline')}
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
            <Table.ScrollContainer minWidth={850}>
              <Table
                className={tableClasses.table}
                striped
                highlightOnHover
                withTableBorder
              >
                <Table.Thead>
                  <Table.Tr>
                    <DateSortHeader
                      label={t('time')}
                      direction={sortDirection}
                      onToggle={() => {
                        setSortDirection((value) =>
                          value === 'asc' ? 'desc' : 'asc',
                        );
                        setPage(1);
                      }}
                    />
                    {[
                      'player',
                      'category',
                      'action',
                      'gold',
                      'target',
                      'details',
                    ].map((key) => (
                      <Table.Th key={key}>{t(key)}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.recent.map((row) => (
                    <Table.Tr key={row.key}>
                      <Table.Td>{new Date(row.at).toLocaleString()}</Table.Td>
                      <Table.Td>
                        {row.display_name} (#{row.actor})
                      </Table.Td>
                      <Table.Td>{t(`categories.${row.category}`)}</Table.Td>
                      <Table.Td>
                        {t(`actions.${row.action}`, {
                          defaultValue: row.action,
                        })}
                      </Table.Td>
                      <Table.Td>{row.gold ?? '—'}</Table.Td>
                      <Table.Td>{row.target ? `#${row.target}` : '—'}</Table.Td>
                      <Table.Td>
                        {row.attack_id && (
                          <Anchor
                            component={Link}
                            href={`/home/admin/attacks?attackId=${row.attack_id}`}
                          >
                            {t('attackNumber', { id: row.attack_id })}
                          </Anchor>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!data.total && <Text c="dimmed">{t('empty')}</Text>}
          </>
        )
      )}
    </Stack>
  );
}
