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
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { AnnouncementSeverity } from '@/lib/prisma-browser-exports';
import { getAdminRequestError } from '@/utils/adminRequests';
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

const safeLink = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

const AnnouncementsPage = () => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<string>('INFO');
  const [isBanner, setIsBanner] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [dismissible, setDismissible] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/announcements');
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      setAnnouncements(await res.json());
      setLoadError(null);
    } catch (err) {
      logError('Failed to load announcements:', err);
      setLoadError(
        'Announcements could not be loaded. Check your access or connection and retry.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setTitle('');
    setBody('');
    setSeverity('INFO');
    setIsBanner(true);
    setIsActive(true);
    setDismissible(true);
    setStartsAt('');
    setEndsAt('');
    setLinkUrl('');
    open();
  };

  const openEdit = (a: any) => {
    setEditId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setSeverity(a.severity);
    setIsBanner(a.isBanner);
    setIsActive(a.isActive);
    setDismissible(a.dismissible);
    setStartsAt(
      a.startsAt ? new Date(a.startsAt).toISOString().slice(0, 16) : '',
    );
    setEndsAt(a.endsAt ? new Date(a.endsAt).toISOString().slice(0, 16) : '');
    setLinkUrl(a.linkUrl ?? '');
    open();
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Title and body are required.',
        color: 'red',
      });
      return;
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      notifications.show({
        title: 'Error',
        message: 'End time must be after start time.',
        color: 'red',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        editId
          ? `/api/admin/content/announcements/${editId}`
          : '/api/admin/content/announcements',
        {
          method: editId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            severity,
            isBanner,
            isActive,
            dismissible,
            startsAt: startsAt ? new Date(startsAt).toISOString() : null,
            endsAt: endsAt ? new Date(endsAt).toISOString() : null,
            linkUrl: linkUrl.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      notifications.show({
        title: editId ? 'Updated' : 'Created',
        message: editId ? 'Announcement updated.' : 'Announcement saved.',
        color: 'green',
      });
      close();
      await fetchAnnouncements();
    } catch (err) {
      logError('Failed to create:', err);
      notifications.show({
        title: 'Error',
        message:
          err instanceof Error ? err.message : 'Failed to save announcement.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: number, currentActive: boolean) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/content/announcements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      {
        await fetchAnnouncements();
        notifications.show({
          title: 'Updated',
          message: `Announcement ${!currentActive ? 'activated' : 'deactivated'}.`,
          color: 'green',
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to update.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/content/announcements/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      {
        await fetchAnnouncements();
        notifications.show({
          title: 'Deleted',
          message: 'Announcement removed.',
          color: 'green',
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to delete.',
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
          <Button onClick={openCreate}>+ New Announcement</Button>
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : loadError ? (
          <Alert color="red" role="alert">
            {loadError}
            <Button ml="md" variant="light" onClick={fetchAnnouncements}>
              Retry
            </Button>
          </Alert>
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
                  <Table.Th>Link</Table.Th>
                  <Table.Th>Starts</Table.Th>
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
                      {safeLink(a.linkUrl) ? (
                        <a
                          href={safeLink(a.linkUrl) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.linkUrl}
                        </a>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      {a.startsAt
                        ? new Date(a.startsAt).toLocaleString()
                        : 'Now'}
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        checked={a.isActive}
                        disabled={submitting}
                        onChange={() => toggleActive(a.id, a.isActive)}
                        aria-label={`Set ${a.title} ${a.isActive ? 'inactive' : 'active'}`}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => openEdit(a)}
                      >
                        Edit
                      </Button>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => setDeleteTarget(a.id)}
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

      <Modal
        opened={opened}
        onClose={close}
        title={editId ? 'Edit Announcement' : 'New Announcement'}
        size="lg"
      >
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
          <TextInput
            label="Link URL"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.currentTarget.value)}
          />
          <TextInput
            label="Starts at (optional)"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.currentTarget.value)}
          />
          <TextInput
            label="Ends at (optional)"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.currentTarget.value)}
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
            <Button onClick={handleSave} loading={submitting}>
              {editId ? 'Save changes' : 'Publish'}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Confirm deletion"
        message="Are you sure you want to permanently delete this announcement?"
        confirmText="Delete"
        cancelText="Cancel"
        type="remove"
      />
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

export default AnnouncementsPage;
