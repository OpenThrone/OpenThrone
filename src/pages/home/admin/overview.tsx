import {
  faBan,
  faBolt,
  faCrosshairs,
  faExclamationTriangle,
  faGavel,
  faScroll,
  faShieldAlt,
  faUserPlus,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Grid, Loader, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import AdminRequestState from '@/components/admin/AdminRequestState';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

interface OverviewStats {
  pendingEmails: number;
  failedEmails24h: number;
  totalUsers: number;
  activeUsers24h: number;
  newUsers7d: number;
  bannedUsers: number;
  totalAlliances: number;
  openReports: number;
  openAppeals: number;
  openCheatSignals: number;
  recentAttacks: number;
}

const StatCard = ({
  label,
  value,
  icon,
  color = 'blue',
}: {
  label: string;
  value: number | string;
  icon: any;
  color?: string;
}) => (
  <Paper p="md" radius="md" withBorder>
    <Grid align="center">
      <Grid.Col span={3}>
        <FontAwesomeIcon
          icon={icon}
          size="2x"
          style={{ opacity: 0.6, color }}
        />
      </Grid.Col>
      <Grid.Col span={9}>
        <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
          {label}
        </Text>
        <Text size="xl" fw={900}>
          {value}
        </Text>
      </Grid.Col>
    </Grid>
  </Paper>
);

const OverviewDashboardPage = () => {
  const { t } = useTranslation('admin-content');
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setStats(await res.json());
    } catch (err) {
      logError('Failed to load overview:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading || error || !stats) {
    return (
      <AdminLayout title="Admin Overview">
        {loading ? (
          <Stack align="center" py="xl">
            <Loader />
          </Stack>
        ) : (
          <AdminRequestState
            message="Dashboard statistics could not be loaded. Check your access or connection and retry."
            onRetry={() => fetchStats()}
          />
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Staff Dashboard"
      permission={PermissionType.VIEW_STAFF_DASHBOARD}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          High-level game & moderation health. Use the sidebar to drill into any
          area.
        </Text>

        <GameCard title={t('emailAdmin.outbox')}>
          <Text size="sm">
            {t('emailAdmin.pending')}: {stats.pendingEmails} ·{' '}
            {t('emailAdmin.failed24h')}: {stats.failedEmails24h}
          </Text>
        </GameCard>
        <GameCard title="Player Base">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Total Players"
                value={stats.totalUsers}
                icon={faUsers}
                color="#22c55e"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Active (24h)"
                value={stats.activeUsers24h}
                icon={faBolt}
                color="#3b82f6"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                label="New (7d)"
                value={stats.newUsers7d}
                icon={faUserPlus}
                color="#eab308"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Banned"
                value={stats.bannedUsers}
                icon={faBan}
                color="#ef4444"
              />
            </Grid.Col>
          </Grid>
        </GameCard>

        <GameCard title="Moderation Queue">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <StatCard
                label="Open Reports"
                value={stats.openReports}
                icon={faExclamationTriangle}
                color="#f59e0b"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <StatCard
                label="Open Appeals"
                value={stats.openAppeals}
                icon={faGavel}
                color="#a855f7"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <StatCard
                label="Cheat Signals"
                value={stats.openCheatSignals}
                icon={faShieldAlt}
                color="#dc2626"
              />
            </Grid.Col>
          </Grid>
        </GameCard>

        <GameCard title="Game World">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <StatCard
                label="Alliances"
                value={stats.totalAlliances}
                icon={faScroll}
                color="#a855f7"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <StatCard
                label="Attacks (24h)"
                value={stats.recentAttacks}
                icon={faCrosshairs}
                color="#6366f1"
              />
            </Grid.Col>
          </Grid>
        </GameCard>
      </Stack>
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
        'admin-content',
      ])),
    },
  };
};

export default OverviewDashboardPage;
