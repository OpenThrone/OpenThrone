import {
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { logError } from '@/utils/logger';

const severityColor = (s: string) => {
  switch (s) {
    case 'CRITICAL':
      return 'red';
    case 'HIGH':
      return 'orange';
    case 'MEDIUM':
      return 'yellow';
    case 'LOW':
      return 'gray';
    default:
      return 'gray';
  }
};

const CheatSignalsPage = () => {
  const [signals, setSignals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/abuse/cheat-signals');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      logError('Failed to load signals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, []);

  const handleAction = async (
    id: number,
    action: 'acknowledge' | 'dismiss' | 'takeAction',
  ) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/abuse/cheat-signals/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId: id }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Updated',
          message: 'Signal updated.',
          color: 'green',
        });
        fetchSignals();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to update.',
        color: 'red',
      });
    } finally {
      setActionId(null);
    }
  };

  return (
    <AdminLayout
      title="Abuse: Cheat Signal Dashboard"
      permissions={['VIEW_CHEAT_SIGNALS']}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Suspicious activity patterns detected by automated rules. Investigate
          before taking action — false positives are common.
        </Text>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : signals.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            No open cheat signals.
          </Text>
        ) : (
          <Paper withBorder>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Severity</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Score</Table.Th>
                  <Table.Th>Summary</Table.Th>
                  <Table.Th>First Seen</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {signals.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Badge color={severityColor(s.severity)}>
                        {s.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{s.type.replace('_', ' ')}</Table.Td>
                    <Table.Td>
                      {s.user?.display_name || 'N/A'} (ID: {s.userId})
                    </Table.Td>
                    <Table.Td>{s.score}</Table.Td>
                    <Table.Td style={{ maxWidth: 300 }}>{s.summary}</Table.Td>
                    <Table.Td>
                      {new Date(s.firstSeenAt).toLocaleString()}
                    </Table.Td>
                    <Table.Td>{s.status}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleAction(s.id, 'acknowledge')}
                          loading={actionId === s.id}
                        >
                          Ack
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="subtle"
                          onClick={() => handleAction(s.id, 'dismiss')}
                          loading={actionId === s.id}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="xs"
                          color="green"
                          variant="subtle"
                          onClick={() => handleAction(s.id, 'takeAction')}
                          loading={actionId === s.id}
                        >
                          Action
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
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
      ])),
    },
  };
};

export default CheatSignalsPage;
