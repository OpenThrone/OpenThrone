import {
  faCoins,
  faMoneyBillWave,
  faPiggyBank,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Grid, Loader, Paper, Stack, Table, Text } from '@mantine/core';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

interface EconomyStats {
  totalLiquidGold: string;
  totalBankGold: string;
  totalGold: string;
  avgLiquidGold: number;
  avgBankGold: number;
  topHolders: Array<{
    id: number;
    display_name: string;
    gold: string;
    bank: string;
    net: string;
  }>;
  transfersLast24h: number;
  transferVolume24h: string;
  totalUsers: number;
}

const formatNum = (n: string | number) => {
  const v = typeof n === 'string' ? BigInt(n) : BigInt(Math.round(n));
  return v.toLocaleString();
};

const EconomyPage = () => {
  const [stats, setStats] = useState<EconomyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/economy');
        if (res.ok) setStats(await res.json());
      } catch (err) {
        logError('Failed to load economy:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <AdminLayout title="Economy Dashboard">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Economy Overview" permissions={['VIEW_ECONOMY']}>
      <Stack gap="md">
        <GameCard title="Gold in Circulation">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder>
                <FontAwesomeIcon icon={faCoins} size="2x" color="#eab308" />
                <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="sm">
                  Total Liquid
                </Text>
                <Text size="xl" fw={900}>
                  {formatNum(stats.totalLiquidGold)}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder>
                <FontAwesomeIcon icon={faPiggyBank} size="2x" color="#a855f7" />
                <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="sm">
                  In Banks
                </Text>
                <Text size="xl" fw={900}>
                  {formatNum(stats.totalBankGold)}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder>
                <FontAwesomeIcon
                  icon={faMoneyBillWave}
                  size="2x"
                  color="#22c55e"
                />
                <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="sm">
                  Total Economy
                </Text>
                <Text size="xl" fw={900}>
                  {formatNum(stats.totalGold)}
                </Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </GameCard>

        <GameCard title="Averages & Activity">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Avg Liquid per Player
                </Text>
                <Text size="lg" fw={700}>
                  {formatNum(stats.avgLiquidGold)}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Avg Bank per Player
                </Text>
                <Text size="lg" fw={700}>
                  {formatNum(stats.avgBankGold)}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Transfers (24h)
                </Text>
                <Text size="lg" fw={700}>
                  {stats.transfersLast24h} ({formatNum(stats.transferVolume24h)}{' '}
                  gold)
                </Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </GameCard>

        <GameCard title="Top 10 Wealthiest Players">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rank</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Liquid</Table.Th>
                <Table.Th>Bank</Table.Th>
                <Table.Th>Net Worth</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stats.topHolders.map((u, i) => (
                <Table.Tr key={u.id}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td>
                    {u.display_name} (ID: {u.id})
                  </Table.Td>
                  <Table.Td>{formatNum(u.gold)}</Table.Td>
                  <Table.Td>{formatNum(u.bank)}</Table.Td>
                  <Table.Td fw={700}>{formatNum(u.net)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
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

export default EconomyPage;
