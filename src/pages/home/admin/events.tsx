import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { GameEventType } from '@prisma/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { logError } from '@/utils/logger';

const statusColor = (s: string) => {
  switch (s) {
    case 'ACTIVE':
      return 'green';
    case 'SCHEDULED':
      return 'blue';
    case 'PAUSED':
      return 'yellow';
    case 'COMPLETED':
      return 'gray';
    case 'CANCELLED':
      return 'red';
    default:
      return 'gray';
  }
};

const GameEventsPage = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('GOLD_MODIFIER');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/game/events');
      if (res.ok) setEvents(await res.json());
    } catch (err) {
      logError('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreate = async () => {
    if (!key.trim() || !name.trim() || !startsAt || !endsAt) {
      notifications.show({
        title: 'Error',
        message: 'Key, name, and date range required.',
        color: 'red',
      });
      return;
    }
    try {
      const res = await fetch('/api/admin/game/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          name,
          description,
          type,
          startsAt,
          endsAt,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Created',
          message: 'Event created.',
          color: 'green',
        });
        setKey('');
        setName('');
        setDescription('');
        close();
        fetchEvents();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to create.',
        color: 'red',
      });
    }
  };

  const handleAction = async (
    id: number,
    action: 'activate' | 'deactivate',
  ) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/game/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Updated',
          message: `Event ${action}d.`,
          color: 'green',
        });
        fetchEvents();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
    } finally {
      setActionId(null);
    }
  };

  return (
    <AdminLayout title="Game: Event Management" permissions={['MANAGE_EVENTS']}>
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Schedule and manage timed in-game events (double XP, holiday
            bonuses, etc.)
          </Text>
          <Button onClick={open}>+ New Event</Button>
        </Group>

        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Key</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Starts</Table.Th>
                <Table.Th>Ends</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>
                    <code>{e.key}</code>
                  </Table.Td>
                  <Table.Td>{e.name}</Table.Td>
                  <Table.Td>{e.type}</Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(e.status)}>{e.status}</Badge>
                  </Table.Td>
                  <Table.Td>{new Date(e.startsAt).toLocaleString()}</Table.Td>
                  <Table.Td>{new Date(e.endsAt).toLocaleString()}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {e.status !== 'ACTIVE' && (
                        <Button
                          size="xs"
                          color="green"
                          onClick={() => handleAction(e.id, 'activate')}
                          loading={actionId === e.id}
                        >
                          Activate
                        </Button>
                      )}
                      {e.status === 'ACTIVE' && (
                        <Button
                          size="xs"
                          color="orange"
                          onClick={() => handleAction(e.id, 'deactivate')}
                          loading={actionId === e.id}
                        >
                          Deactivate
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={close} title="New Game Event">
        <Stack>
          <TextInput
            label="Key (unique identifier)"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
          />
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Select
            label="Type"
            data={Object.values(GameEventType).map((t) => ({
              value: t,
              label: t,
            }))}
            value={type}
            onChange={(v) => v && setType(v)}
          />
          <TextInput
            label="Starts At"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.currentTarget.value)}
          />
          <TextInput
            label="Ends At"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </Group>
        </Stack>
      </Modal>
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

export default GameEventsPage;
