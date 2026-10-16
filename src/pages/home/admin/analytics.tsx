import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import tableClasses from '@/components/admin/AdminDataTable.module.css';
import AdminLayout from '@/components/admin/AdminLayout';
import DateSortHeader from '@/components/admin/DateSortHeader';
import PlayerActivity from '@/components/admin/PlayerActivity';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

interface TrendPoint {
  date: string;
  registrations: number;
  activePlayers: number;
  attacks: number;
}
interface AnalyticsData {
  days: number;
  totals: Omit<TrendPoint, 'date'>;
  trend: TrendPoint[];
}

const AnalyticsPage = () => {
  const { t } = useTranslation('admin-game');
  const { t: tActivity } = useTranslation('admin-activity');
  const [days, setDays] = useState('30');
  const [dateDirection, setDateDirection] = useState<'asc' | 'desc'>('desc');
  const router = useRouter();
  useEffect(() => {
    const range = String(router.query.days ?? '');
    if (['7', '30', '90'].includes(range)) setDays(range);
  }, [router.query.days]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/admin/analytics/players?days=${days}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (cause) {
      logError('Failed to load analytics:', cause);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <AdminLayout title={t('analyticsTitle')} permissions={['VIEW_ANALYTICS']}>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={700}>{t('analyticsTitle')}</Text>
          <Select
            aria-label={t('range')}
            value={days}
            onChange={(value) => value && setDays(value)}
            data={[
              { value: '7', label: t('days7') },
              { value: '30', label: t('days30') },
              { value: '90', label: t('days90') },
            ]}
            w={160}
          />
        </Group>
        <Tabs defaultValue="activity">
          <Tabs.List>
            <Tabs.Tab value="activity">{tActivity('playerActivity')}</Tabs.Tab>
            <Tabs.Tab value="trends">
              {tActivity('registrationTrends')}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="activity" pt="md">
            <PlayerActivity key={days} days={days} />
          </Tabs.Panel>
          <Tabs.Panel value="trends" pt="md">
            <Text size="sm" c="dimmed" mb="md">
              {t('analyticsCaveat')}
            </Text>
            {error && (
              <Alert color="red" title={t('analyticsError')}>
                <Button size="xs" onClick={() => fetchStats()}>
                  {t('retry')}
                </Button>
              </Alert>
            )}
            {loading ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : (
              data && (
                <>
                  <Group grow align="stretch">
                    {[
                      [t('registrations'), data.totals.registrations],
                      [t('activePlayers'), data.totals.activePlayers],
                      [t('attacks'), data.totals.attacks],
                    ].map(([label, value]) => (
                      <Paper key={String(label)} p="md" withBorder>
                        <Text size="sm" c="dimmed">
                          {label}
                        </Text>
                        <Text size="xl" fw={700}>
                          {Number(value).toLocaleString()}
                        </Text>
                      </Paper>
                    ))}
                  </Group>
                  <GameCard title={t('analyticsTitle')}>
                    <div style={{ width: '100%', height: 320 }}>
                      <ResponsiveContainer>
                        <LineChart
                          data={data.trend}
                          margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis
                            dataKey="date"
                            minTickGap={24}
                            tickFormatter={(date: string) =>
                              new Date(`${date}T00:00:00Z`).toLocaleDateString(
                                undefined,
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  timeZone: 'UTC',
                                },
                              )
                            }
                          />
                          <YAxis allowDecimals={false} />
                          <Tooltip
                            labelFormatter={(date) =>
                              new Date(`${date}T00:00:00Z`).toLocaleDateString()
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="registrations"
                            name={t('registrations')}
                            stroke="var(--mantine-color-yellow-5)"
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="activePlayers"
                            name={t('activePlayers')}
                            stroke="var(--mantine-color-green-5)"
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="attacks"
                            name={t('attacks')}
                            stroke="var(--mantine-color-blue-5)"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </GameCard>
                  <Paper withBorder p="xs">
                    <Table.ScrollContainer minWidth={480}>
                      <Table className={tableClasses.table} striped>
                        <Table.Thead>
                          <Table.Tr>
                            <DateSortHeader
                              label={t('date')}
                              direction={dateDirection}
                              onToggle={() =>
                                setDateDirection((value) =>
                                  value === 'asc' ? 'desc' : 'asc',
                                )
                              }
                            />
                            <Table.Th>{t('registrations')}</Table.Th>
                            <Table.Th>{t('activePlayers')}</Table.Th>
                            <Table.Th>{t('attacks')}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {[...data.trend]
                            .sort((a, b) =>
                              dateDirection === 'asc'
                                ? a.date.localeCompare(b.date)
                                : b.date.localeCompare(a.date),
                            )
                            .map((point) => (
                              <Table.Tr key={point.date}>
                                <Table.Td>
                                  {new Date(
                                    `${point.date}T00:00:00Z`,
                                  ).toLocaleDateString()}
                                </Table.Td>
                                <Table.Td>
                                  {point.registrations.toLocaleString()}
                                </Table.Td>
                                <Table.Td>
                                  {point.activePlayers.toLocaleString()}
                                </Table.Td>
                                <Table.Td>
                                  {point.attacks.toLocaleString()}
                                </Table.Td>
                              </Table.Tr>
                            ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  </Paper>
                </>
              )
            )}
          </Tabs.Panel>
        </Tabs>
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
      'admin-game',
      'admin-activity',
    ])),
  },
});

export default AnalyticsPage;
