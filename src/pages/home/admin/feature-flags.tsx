import {
  Button,
  Group,
  Modal,
  Paper,
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
import { logError } from '@/utils/logger';

const FeatureFlagsPage = () => {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system/feature-flags');
      if (res.ok) setFlags(await res.json());
    } catch (err) {
      logError('Failed to load flags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const toggle = async (flag: any) => {
    try {
      const res = await fetch('/api/admin/system/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flag.key, enabled: !flag.enabled }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Updated',
          message: `Flag ${!flag.enabled ? 'enabled' : 'disabled'}.`,
          color: 'green',
        });
        fetchFlags();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
    }
  };

  const create = async () => {
    if (!key.trim()) return;
    try {
      const res = await fetch('/api/admin/system/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, description, enabled: false }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Created',
          message: 'Flag created.',
          color: 'green',
        });
        setKey('');
        setDescription('');
        close();
        fetchFlags();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
    }
  };

  return (
    <AdminLayout
      title="System: Feature Flags"
      permissions={['MANAGE_FEATURE_FLAGS']}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Toggle game features on/off without code changes. Use sparingly.
          </Text>
          <Button onClick={open}>+ New Flag</Button>
        </Group>

        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Key</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Enabled</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {flags.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td>
                    <code>{f.key}</code>
                  </Table.Td>
                  <Table.Td>{f.description || '—'}</Table.Td>
                  <Table.Td>
                    <Switch checked={f.enabled} onChange={() => toggle(f)} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={close} title="New Feature Flag">
        <Stack>
          <TextInput
            label="Key (unique identifier)"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            placeholder="e.g. ENABLE_DOUBLE_XP"
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={create}>Create</Button>
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

export default FeatureFlagsPage;
