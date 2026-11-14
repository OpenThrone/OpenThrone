import {
  Alert,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

interface TrafficData {
  days: number;
  configured: boolean;
  envNames?: string[];
  gaError?: string;
  totals?: {
    activeUsers: number;
    newUsers: number;
    sessions: number;
    screenPageViews: number;
    averageSessionDurationSeconds: number;
    engagementRate: number;
  };
  trend?: Array<{
    date: string;
    activeUsers: number;
    sessions: number;
    screenPageViews: number;
  }>;
  topPages?: Array<{ pagePath: string; views: number; users: number }>;
  sources?: Array<{ sessionSourceMedium: string; sessions: number }>;
  countries?: Array<{ country: string; activeUsers: number }>;
  devices?: Array<{ deviceCategory: string; activeUsers: number }>;
  realtimeActiveUsers?: number | null;
  consent: {
    trend: Array<{ date: string; granted: number; denied: number }>;
    totals: { granted: number; denied: number };
    optInRate: number | null;
  };
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(rest).padStart(2, '0')}s`
    : `${rest}s`;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const axisDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** Google Analytics traffic and the cookie-consent opt-in rate. */
const TrafficPage = () => {
  const { t } = useTranslation('admin-activity');
  const [days, setDays] = useState('30');
  const router = useRouter();
  useEffect(() => {
    const range = String(router.query.days ?? '');
    if (['7', '30', '90'].includes(range)) setDays(range);
  }, [router.query.days]);
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchTraffic = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/admin/analytics/traffic?days=${days}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (cause) {
      logError('Failed to load traffic analytics:', cause);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchTraffic();
  }, [fetchTraffic]);

  const consent = data?.consent;
  const consentTiles = consent && (
    <Group grow align="stretch" gap="sm">
      {(
        [
          ['granted', consent.totals.granted],
          ['denied', consent.totals.denied],
        ] as const
      ).map(([key, value]) => (
        <Paper key={key} p="md" withBorder>
          <Text size="sm" c="dimmed">
            {t(`traffic.consent.${key}`)}
          </Text>
          <Text size="xl" fw={700}>
            {value.toLocaleString()}
          </Text>
        </Paper>
      ))}
      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed">
          {t('traffic.consent.optInRate')}
        </Text>
        <Text size="xl" fw={700}>
          {consent.optInRate === null
            ? t('traffic.consent.noChoices')
            : formatRate(consent.optInRate)}
        </Text>
      </Paper>
    </Group>
  );

  return (
    <AdminLayout title={t('traffic.title')} permissions={['VIEW_ANALYTICS']}>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={700}>{t('traffic.title')}</Text>
          <Select
            aria-label={t('traffic.range')}
            value={days}
            onChange={(value) => value && setDays(value)}
            data={[
              { value: '7', label: t('traffic.days7') },
              { value: '30', label: t('traffic.days30') },
              { value: '90', label: t('traffic.days90') },
            ]}
            w={{ base: '100%', sm: 160 }}
          />
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : error ? (
          <Alert color="red" title={t('traffic.loadError')}>
            {t('traffic.retryHint')}
          </Alert>
        ) : (
          data && (
            <>
              {!data.configured && (
                <Alert color="yellow" title={t('traffic.setup.title')}>
                  <Stack gap="xs">
                    <Text size="sm">{t('traffic.setup.intro')}</Text>
                    <ul>
                      {(data.envNames ?? []).map((name) => (
                        <li key={name}>
                          <Text component="code" size="sm">
                            {name}
                          </Text>
                        </li>
                      ))}
                    </ul>
                    <Text size="sm">{t('traffic.setup.steps')}</Text>
                  </Stack>
                </Alert>
              )}
              {data.gaError && (
                <Alert color="red" title={t('traffic.gaError')}>
                  {t('traffic.retryHint')}
                </Alert>
              )}
              {data.configured && !data.gaError && data.totals && (
                <>
                  <SimpleGrid cols={{ base: 2, sm: 4, xl: 7 }} spacing="sm">
                    {(
                      [
                        [
                          'activeUsers',
                          data.totals.activeUsers.toLocaleString(),
                        ],
                        ['newUsers', data.totals.newUsers.toLocaleString()],
                        ['sessions', data.totals.sessions.toLocaleString()],
                        [
                          'screenPageViews',
                          data.totals.screenPageViews.toLocaleString(),
                        ],
                        [
                          'averageSessionDuration',
                          formatDuration(
                            data.totals.averageSessionDurationSeconds,
                          ),
                        ],
                        [
                          'engagementRate',
                          formatRate(data.totals.engagementRate),
                        ],
                        [
                          'realtime',
                          data.realtimeActiveUsers === null ||
                          data.realtimeActiveUsers === undefined
                            ? '—'
                            : data.realtimeActiveUsers.toLocaleString(),
                        ],
                      ] as const
                    ).map(([key, value]) => (
                      <Paper
                        key={key}
                        p="md"
                        withBorder
                        style={{ minWidth: 120 }}
                      >
                        <Text size="sm" c="dimmed">
                          {t(`traffic.totals.${key}`)}
                        </Text>
                        <Text size="xl" fw={700}>
                          {value}
                        </Text>
                      </Paper>
                    ))}
                  </SimpleGrid>
                  <GameCard title={t('traffic.trendTitle')}>
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
                            tickFormatter={axisDate}
                          />
                          <YAxis allowDecimals={false} />
                          <Tooltip labelFormatter={axisDate} />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="activeUsers"
                            name={t('traffic.totals.activeUsers')}
                            stroke="var(--mantine-color-yellow-5)"
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="sessions"
                            name={t('traffic.totals.sessions')}
                            stroke="var(--mantine-color-green-5)"
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="screenPageViews"
                            name={t('traffic.totals.screenPageViews')}
                            stroke="var(--mantine-color-blue-5)"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </GameCard>
                  <GameCard title={t('traffic.topPages')}>
                    <AdminDataTable
                      size="default"
                      ariaLabel={t('traffic.topPages')}
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t('traffic.pagePath')}</Table.Th>
                          <Table.Th>{t('traffic.views')}</Table.Th>
                          <Table.Th>{t('traffic.users')}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {data.topPages?.length ? (
                          data.topPages.map((page) => (
                            <Table.Tr key={page.pagePath}>
                              <Table.Td>
                                <Text component="code" size="sm">
                                  {page.pagePath}
                                </Text>
                              </Table.Td>
                              <Table.Td>{page.views.toLocaleString()}</Table.Td>
                              <Table.Td>{page.users.toLocaleString()}</Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={3}>
                              {t('traffic.empty')}
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </AdminDataTable>
                  </GameCard>
                  <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                    <GameCard title={t('traffic.sources')}>
                      <AdminDataTable
                        size="compact"
                        ariaLabel={t('traffic.sources')}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t('traffic.source')}</Table.Th>
                            <Table.Th>{t('traffic.totals.sessions')}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {data.sources?.length ? (
                            data.sources.map((source) => (
                              <Table.Tr key={source.sessionSourceMedium}>
                                <Table.Td>
                                  {source.sessionSourceMedium}
                                </Table.Td>
                                <Table.Td>
                                  {source.sessions.toLocaleString()}
                                </Table.Td>
                              </Table.Tr>
                            ))
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={2}>
                                {t('traffic.empty')}
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </AdminDataTable>
                    </GameCard>
                    <GameCard title={t('traffic.countries')}>
                      <AdminDataTable
                        size="compact"
                        ariaLabel={t('traffic.countries')}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t('traffic.country')}</Table.Th>
                            <Table.Th>
                              {t('traffic.totals.activeUsers')}
                            </Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {data.countries?.length ? (
                            data.countries.map((country) => (
                              <Table.Tr key={country.country}>
                                <Table.Td>{country.country}</Table.Td>
                                <Table.Td>
                                  {country.activeUsers.toLocaleString()}
                                </Table.Td>
                              </Table.Tr>
                            ))
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={2}>
                                {t('traffic.empty')}
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </AdminDataTable>
                    </GameCard>
                    <GameCard title={t('traffic.devices')}>
                      <AdminDataTable
                        size="compact"
                        ariaLabel={t('traffic.devices')}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t('traffic.device')}</Table.Th>
                            <Table.Th>
                              {t('traffic.totals.activeUsers')}
                            </Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {data.devices?.length ? (
                            data.devices.map((device) => (
                              <Table.Tr key={device.deviceCategory}>
                                <Table.Td>{device.deviceCategory}</Table.Td>
                                <Table.Td>
                                  {device.activeUsers.toLocaleString()}
                                </Table.Td>
                              </Table.Tr>
                            ))
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={2}>
                                {t('traffic.empty')}
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </AdminDataTable>
                    </GameCard>
                  </SimpleGrid>
                </>
              )}
              <GameCard title={t('traffic.consent.title')}>
                <Stack gap="sm">
                  {consentTiles}
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <LineChart
                        data={consent?.trend}
                        margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis
                          dataKey="date"
                          minTickGap={24}
                          tickFormatter={axisDate}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip labelFormatter={axisDate} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="granted"
                          name={t('traffic.consent.granted')}
                          stroke="var(--mantine-color-green-5)"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="denied"
                          name={t('traffic.consent.denied')}
                          stroke="var(--mantine-color-red-5)"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <Text size="sm" c="dimmed">
                    {t('traffic.consent.note')}
                  </Text>
                </Stack>
              </GameCard>
            </>
          )
        )}
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
      'admin-activity',
    ])),
  },
});

export default TrafficPage;
