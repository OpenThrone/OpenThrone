import {
  Alert,
  Button,
  Group,
  Loader,
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
import { AnnouncementSeverity } from '@prisma/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { logError } from '@/utils/logger';

const severityColor = (s: string) => {
  switch (s) {
    case 'CRITICAL':
      return 'red';
    case 'WARNING':
      return 'yellow';
    case 'SUCCESS':
      return 'green';
    default:
      return 'blue';
  }
};

const AnnouncementsPage = () => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<string>('INFO');
  const [isBanner, setIsBanner] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [dismissible, setDismissible] = useState(true);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (err) {
      logError('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Title and body are required.',
        color: 'red',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/content/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          severity,
          isBanner,
          isActive,
          dismissible,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Created',
          message: 'Announcement published.',
          color: 'green',
        });
        setTitle('');
        setBody('');
        close();
        fetchAnnouncements();
      }
    } catch (err) {
      logError('Failed to create:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to create announcement.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: number, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/content/announcements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        fetchAnnouncements();
        notifications.show({
          title: 'Updated',
          message: `Announcement ${!currentActive ? 'activated' : 'deactivated'}.`,
          color: 'green',
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to update.',
        color: 'red',
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/content/announcements/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchAnnouncements();
        notifications.show({
          title: 'Deleted',
          message: 'Announcement removed.',
          color: 'green',
        });
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
      title="Content: Announcements"
      permissions={['MANAGE_ANNOUNCEMENTS']}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Publish game-wide banners and alerts visible to all users.
          </Text>
          <Button onClick={open}>+ New Announcement</Button>
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : announcements.length === 0 ? (
          <Alert color="blue">
            No announcements yet. Create your first one.
          </Alert>
        ) : (
          <Paper withBorder>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Severity</Table.Th>
                  <Table.Th>Banner</Table.Th>
                  <Table.Th>Active</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {announcements.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>{a.title}</Table.Td>
                    <Table.Td>
                      <Text c={severityColor(a.severity)} fw={700}>
                        {a.severity}
                      </Text>
                    </Table.Td>
                    <Table.Td>{a.isBanner ? 'Yes' : 'No'}</Table.Td>
                    <Table.Td>
                      <Switch
                        checked={a.isActive}
                        onChange={() => toggleActive(a.id, a.isActive)}
                      />
                    </Table.Td>
                    <Table.Td>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => handleDelete(a.id)}
                      >
                        Delete
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>

      <Modal opened={opened} onClose={close} title="New Announcement" size="lg">
        <Stack gap="md">
          <TextInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Textarea
            label="Body"
            minRows={4}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
          />
          <Select
            label="Severity"
            data={Object.values(AnnouncementSeverity).map((s) => ({
              value: s,
              label: s,
            }))}
            value={severity}
            onChange={(v) => v && setSeverity(v)}
          />
          <Switch
            label="Show as banner"
            checked={isBanner}
            onChange={(e) => setIsBanner(e.currentTarget.checked)}
          />
          <Switch
            label="Active immediately"
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
          <Switch
            label="User can dismiss"
            checked={dismissible}
            onChange={(e) => setDismissible(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={submitting}>
              Publish
            </Button>
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

export default AnnouncementsPage;
