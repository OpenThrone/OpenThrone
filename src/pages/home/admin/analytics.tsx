import { Grid, Loader, Paper, Stack, Text } from '@mantine/core';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

interface Analytics {
  dau: number;
  wau: number;
  mau: number;
  newToday: number;
  new7d: number;
  new30d: number;
  totalAttacks24h: number;
  totalAttacks7d: number;
}

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <Paper p="md" withBorder>
    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
      {label}
    </Text>
    <Text size="xl" fw={900}>
      {value.toLocaleString()}
    </Text>
  </Paper>
);

const AnalyticsPage = () => {
  const [stats, setStats] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/analytics/players');
        if (res.ok) setStats(await res.json());
      } catch (err) {
        logError('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <AdminLayout title="Analytics">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Player Analytics" permissions={['VIEW_ANALYTICS']}>
      <Stack gap="md">
        <GameCard title="Active Users">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <StatCard label="Daily Active (24h)" value={stats.dau} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <StatCard label="Weekly Active" value={stats.wau} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <StatCard label="Monthly Active" value={stats.mau} />
            </Grid.Col>
          </Grid>
        </GameCard>

        <GameCard title="New Registrations">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <StatCard label="New Today" value={stats.newToday} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <StatCard label="New (7d)" value={stats.new7d} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <StatCard label="New (30d)" value={stats.new30d} />
            </Grid.Col>
          </Grid>
        </GameCard>

        <GameCard title="Battle Activity">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <StatCard label="Attacks (24h)" value={stats.totalAttacks24h} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <StatCard label="Attacks (7d)" value={stats.totalAttacks7d} />
            </Grid.Col>
          </Grid>
        </GameCard>
      </Stack>
    </AdminLayout>
  );
};

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

export default AnalyticsPage;
