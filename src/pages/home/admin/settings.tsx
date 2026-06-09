import {
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { ServerSettingType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const ServerSettingsPage = () => {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<any>(null);

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('STRING');
  const [value, setValue] = useState<string>('');
  const [isPublic, setIsPublic] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system/server-settings');
      if (res.ok) setSettings(await res.json());
    } catch (err) {
      logError('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const startEdit = (s: any) => {
    setEditing(s);
    setKey(s.key);
    setLabel(s.label);
    setDescription(s.description || '');
    setType(s.type);
    setValue(
      typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value),
    );
    setIsPublic(s.isPublic);
    open();
  };

  const startCreate = () => {
    setEditing(null);
    setKey('');
    setLabel('');
    setDescription('');
    setType('STRING');
    setValue('');
    setIsPublic(false);
    open();
  };

  const save = async () => {
    let parsedValue: any = value;
    if (type === 'NUMBER') parsedValue = Number(value);
    if (type === 'BOOLEAN') parsedValue = value === 'true';
    if (type === 'JSON') {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        notifications.show({
          title: 'Error',
          message: 'Invalid JSON.',
          color: 'red',
        });
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/system/server-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value: parsedValue,
          label,
          description,
          type,
          isPublic,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Saved',
          message: 'Setting updated.',
          color: 'green',
        });
        close();
        fetchSettings();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to save.',
        color: 'red',
      });
    }
  };

  const remove = async (key: string) => {
    try {
      const res = await fetch(
        `/api/admin/system/server-settings?key=${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        notifications.show({
          title: 'Deleted',
          message: 'Setting removed.',
          color: 'green',
        });
        fetchSettings();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete.',
        color: 'red',
      });
    }
  };

  return (
    <AdminLayout
      title="System: Server Settings"
      permissions={['MANAGE_SERVER_SETTINGS']}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Runtime gameplay configuration. Changes take effect immediately.
          </Text>
          <Button onClick={startCreate}>+ New Setting</Button>
        </Group>

        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Key</Table.Th>
                <Table.Th>Label</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Value</Table.Th>
                <Table.Th>Public</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {settings.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Code>{s.key}</Code>
                  </Table.Td>
                  <Table.Td>{s.label}</Table.Td>
                  <Table.Td>
                    <Badge>{s.type}</Badge>
                  </Table.Td>
                  <Table.Td style={{ maxWidth: 250, overflow: 'hidden' }}>
                    <Code>
                      {typeof s.value === 'object'
                        ? JSON.stringify(s.value)
                        : String(s.value)}
                    </Code>
                  </Table.Td>
                  <Table.Td>{s.isPublic ? '✓' : '—'}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => startEdit(s)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => remove(s.key)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? 'Edit Setting' : 'New Setting'}
      >
        <Stack>
          <TextInput
            label="Key"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            disabled={!!editing}
          />
          <TextInput
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Select
            label="Type"
            data={Object.values(ServerSettingType).map((t) => ({
              value: t,
              label: t,
            }))}
            value={type}
            onChange={(v) => v && setType(v)}
          />
          <TextInput
            label="Value"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
          />
          <Switch
            label="Public (visible to all staff)"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </Group>
        </Stack>
      </Modal>
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

export default ServerSettingsPage;
