import { Badge, Button, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PermissionType } from '@prisma/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import PermissionCheck from '@/components/PermissionCheck';
import { logError } from '@/utils/logger';

const EraManagementPage = () => {
  const [eras, setEras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const fetchEras = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/game/eras');
      if (res.ok) setEras(await res.json());
    } catch (err) {
      logError('Failed to load eras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEras();
  }, []);

  const startNewEra = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/admin/game/eras', { method: 'POST' });
      if (res.ok) {
        notifications.show({
          title: 'New Era Started',
          message: 'A new game era has been initiated.',
          color: 'green',
        });
        fetchEras();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to start new era.',
        color: 'red',
      });
    } finally {
      setStarting(false);
    }
  };

  const current = eras.find((e) => !e.endDate);
  const past = eras.filter((e) => e.endDate);

  return (
    <PermissionCheck permissions={['MANAGE_ERAS']}>
      <MainArea title="Game: Era Management">
        <Stack gap="md">
          <GameCard title="Current Era">
            {current ? (
              <Paper p="md" withBorder>
                <Group justify="space-between">
                  <div>
                    <Text fw={900} size="lg">
                      {current.name}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Started: {new Date(current.startDate).toLocaleString()}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Players: {current._count?.userEras ?? '—'}
                    </Text>
                  </div>
                  <Badge color="green" size="lg">
                    Active
                  </Badge>
                </Group>
              </Paper>
            ) : (
              <Text c="dimmed">No active era.</Text>
            )}
            <Group mt="md" justify="flex-end">
              <Button
                color="orange"
                onClick={startNewEra}
                loading={starting}
                disabled={!current}
              >
                End Current Era & Start New
              </Button>
            </Group>
          </GameCard>

          <GameCard title={`Past Eras (${past.length})`}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Started</Table.Th>
                  <Table.Th>Ended</Table.Th>
                  <Table.Th>Players</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {past.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>{e.name}</Table.Td>
                    <Table.Td>{new Date(e.startDate).toLocaleDateString()}</Table.Td>
                    <Table.Td>
                      {e.endDate ? new Date(e.endDate).toLocaleDateString() : '—'}
                    </Table.Td>
                    <Table.Td>{e._count?.userEras ?? '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </GameCard>
        </Stack>
      </MainArea>
    </PermissionCheck>
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

export default EraManagementPage;
