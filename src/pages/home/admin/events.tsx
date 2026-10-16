import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
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
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameEventType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

interface GameEvent {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  config: { goldMultiplier?: number; xpMultiplier?: number };
}

interface EventForm {
  key: string;
  name: string;
  description: string;
  type: string;
  startsAt: string;
  endsAt: string;
  multiplier: number;
}

const blankForm: EventForm = {
  key: '',
  name: '',
  description: '',
  type: GameEventType.GOLD_MODIFIER,
  startsAt: '',
  endsAt: '',
  multiplier: 2,
};

function toLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const GameEventsPage = () => {
  const { t } = useTranslation('admin-game');
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<GameEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GameEvent | null>(null);
  const [form, setForm] = useState<EventForm>(blankForm);
  const [opened, { open, close }] = useDisclosure(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/admin/game/events');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setEvents(await response.json());
    } catch (error) {
      logError('Failed to load events:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const startCreate = () => {
    setEditing(null);
    setForm(blankForm);
    open();
  };
  const startEdit = (event: GameEvent) => {
    setEditing(event);
    setForm({
      key: event.key,
      name: event.name,
      description: event.description ?? '',
      type: event.type,
      startsAt: toLocalInput(event.startsAt),
      endsAt: toLocalInput(event.endsAt),
      multiplier:
        event.type === GameEventType.GOLD_MODIFIER
          ? (event.config?.goldMultiplier ?? 1)
          : (event.config?.xpMultiplier ?? 1),
    });
    open();
  };

  const submit = async () => {
    if (
      !form.key.trim() ||
      !form.name.trim() ||
      !form.startsAt ||
      !form.endsAt ||
      new Date(form.endsAt) <= new Date(form.startsAt)
    ) {
      notifications.show({
        title: t('eventsTitle'),
        message: t('startsBeforeEnds'),
        color: 'red',
      });
      return;
    }
    const config =
      form.type === GameEventType.GOLD_MODIFIER
        ? { goldMultiplier: form.multiplier }
        : { xpMultiplier: form.multiplier };
    setSaving(true);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/game/events/${editing.id}`
          : '/api/admin/game/events',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: form.key.trim(),
            name: form.name.trim(),
            description: form.description || null,
            type: form.type,
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString(),
            config,
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      close();
      await fetchEvents();
    } catch (error) {
      logError('Failed to save game event:', error);
      notifications.show({
        title: t('eventsTitle'),
        message: t('saveError'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    event: GameEvent,
    action: 'activate' | 'deactivate' | 'delete',
  ) => {
    setBusyId(event.id);
    try {
      const response = await fetch(`/api/admin/game/events/${event.id}`, {
        method: action === 'delete' ? 'DELETE' : 'PUT',
        ...(action === 'delete'
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action }),
            }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fetchEvents();
    } catch (error) {
      logError('Failed to change game event:', error);
      notifications.show({
        title: t('eventsTitle'),
        message: action === 'delete' ? t('deleteError') : t('actionError'),
        color: 'red',
      });
    } finally {
      setBusyId(null);
    }
  };

  const supported =
    form.type === GameEventType.GOLD_MODIFIER ||
    form.type === GameEventType.CUSTOM;
  const rows = events.map((event) => (
    <Table.Tr key={event.id}>
      <Table.Td>
        <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
          {event.key}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fw={600}>{event.name}</Text>
      </Table.Td>
      <Table.Td>
        {event.type === GameEventType.GOLD_MODIFIER
          ? t('goldModifier')
          : event.type === GameEventType.CUSTOM
            ? t('xpModifier')
            : t('otherType')}
      </Table.Td>
      <Table.Td>
        <Badge color={event.status === 'ACTIVE' ? 'green' : 'gray'}>
          {event.status}
        </Badge>
      </Table.Td>
      <Table.Td>{new Date(event.startsAt).toLocaleString()}</Table.Td>
      <Table.Td>{new Date(event.endsAt).toLocaleString()}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="wrap">
          {event.type === GameEventType.GOLD_MODIFIER ||
          event.type === GameEventType.CUSTOM ? (
            <>
              <Button
                size="xs"
                variant="default"
                onClick={() => startEdit(event)}
              >
                {t('edit')}
              </Button>
              {event.status === 'ACTIVE' ? (
                <Button
                  size="xs"
                  color="orange"
                  loading={busyId === event.id}
                  onClick={() => runAction(event, 'deactivate')}
                >
                  {t('deactivate')}
                </Button>
              ) : (
                <Button
                  size="xs"
                  color="green"
                  loading={busyId === event.id}
                  onClick={() => runAction(event, 'activate')}
                >
                  {t('activate')}
                </Button>
              )}
              <Button
                size="xs"
                color="red"
                variant="outline"
                loading={busyId === event.id}
                onClick={() => setDeleteTarget(event)}
              >
                {t('delete')}
              </Button>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {t('unsupportedEventHint')}
            </Text>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <AdminLayout title={t('eventsTitle')} permissions={['MANAGE_EVENTS']}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Text size="sm" c="dimmed" maw={680}>
            {t('eventsIntro')}
          </Text>
          <Button onClick={startCreate}>{t('newEvent')}</Button>
        </Group>
        {loadError && (
          <Alert color="red" title={t('loadError')}>
            <Button size="xs" onClick={() => fetchEvents()}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        <Paper withBorder p="xs">
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('key')}</Table.Th>
                  <Table.Th>{t('name')}</Table.Th>
                  <Table.Th>{t('eventType')}</Table.Th>
                  <Table.Th>{t('status')}</Table.Th>
                  <Table.Th>{t('startsAt')}</Table.Th>
                  <Table.Th>{t('endsAt')}</Table.Th>
                  <Table.Th>{t('actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{!loading && rows}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {loading && (
            <Text ta="center" p="md" role="status">
              {t('loading')}
            </Text>
          )}
          {!loading && !loadError && events.length === 0 && (
            <Text ta="center" c="dimmed" p="md">
              {t('emptyEvents')}
            </Text>
          )}
        </Paper>
      </Stack>
      <Modal
        opened={opened}
        onClose={() => {
          if (!saving) close();
        }}
        title={editing ? t('editEvent') : t('newEvent')}
      >
        <Stack>
          <TextInput
            label={t('eventKey')}
            value={form.key}
            maxLength={100}
            disabled={!!editing}
            onChange={(e) => setForm({ ...form, key: e.currentTarget.value })}
          />
          <TextInput
            label={t('eventName')}
            value={form.name}
            maxLength={200}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <Textarea
            label={t('description')}
            value={form.description}
            maxLength={2000}
            autosize
            minRows={2}
            maxRows={5}
            onChange={(e) =>
              setForm({ ...form, description: e.currentTarget.value })
            }
          />
          <Select
            label={t('type')}
            data={[
              { value: GameEventType.GOLD_MODIFIER, label: t('goldModifier') },
              { value: GameEventType.CUSTOM, label: t('xpModifier') },
            ]}
            value={supported ? form.type : null}
            onChange={(value) => value && setForm({ ...form, type: value })}
          />
          {supported ? (
            <NumberInput
              label={
                form.type === GameEventType.GOLD_MODIFIER
                  ? t('goldMultiplier')
                  : t('xpMultiplier')
              }
              value={form.multiplier}
              min={0.1}
              max={10}
              step={0.1}
              decimalScale={2}
              onChange={(value) =>
                setForm({
                  ...form,
                  multiplier: typeof value === 'number' ? value : 1,
                })
              }
            />
          ) : (
            <Alert color="yellow">{t('unsupportedEventHint')}</Alert>
          )}
          <TextInput
            label={t('startsAt')}
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) =>
              setForm({ ...form, startsAt: e.currentTarget.value })
            }
          />
          <TextInput
            label={t('endsAt')}
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) =>
              setForm({ ...form, endsAt: e.currentTarget.value })
            }
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button onClick={() => submit()} loading={saving}>
              {editing ? t('save') : t('create')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) runAction(deleteTarget, 'delete');
          setDeleteTarget(null);
        }}
        title={t('delete')}
        message={t('deleteConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isLoading={deleteTarget !== null && busyId === deleteTarget.id}
        type="remove"
      />
    </AdminLayout>
  );
};

export const getServerSideProps = async ({ locale }: { locale?: string }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-game',
    ])),
  },
});

export default GameEventsPage;
