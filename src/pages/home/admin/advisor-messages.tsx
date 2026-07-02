import { faChessQueen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

const AdvisorMessagesPage = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [messageText, setMessageText] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/advisor-messages');
      if (res.ok) setMessages(await res.json());
    } catch (err) {
      logError('Failed to load advisor messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setMessageText('');
    setSortOrder(messages.length);
    setIsActive(true);
    open();
  };

  const openEdit = (msg: any) => {
    setEditId(msg.id);
    setMessageText(msg.message);
    setSortOrder(msg.sort_order);
    setIsActive(msg.is_active);
    open();
  };

  const handleSubmit = async () => {
    if (!messageText.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Message is required.',
        color: 'red',
      });
      return;
    }
    setSubmitting(true);
    try {
      const url = editId
        ? `/api/admin/content/advisor-messages/${editId}`
        : '/api/admin/content/advisor-messages';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          sort_order: sortOrder,
          is_active: isActive,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: editId ? 'Updated' : 'Created',
          message: `Advisor message ${editId ? 'updated' : 'created'}.`,
          color: 'green',
        });
        close();
        fetchMessages();
      }
    } catch (err) {
      logError('Failed to save advisor message:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to save.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: number, current: boolean) => {
    try {
      const res = await fetch(`/api/admin/content/advisor-messages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      });
      if (res.ok) fetchMessages();
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
      const res = await fetch(`/api/admin/content/advisor-messages/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchMessages();
        notifications.show({
          title: 'Deleted',
          message: 'Message removed.',
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
      title="Content: Advisor Messages"
      permissions={[PermissionType.MANAGE_CONTENT]}
    >
      <Stack gap="md">
        <GameCard
          title="Advisor Messages"
          icon={faChessQueen}
          action={
            <Button size="xs" color="yellow" onClick={openCreate}>
              + New Message
            </Button>
          }
        >
          <Text size="sm" c="gray.3" lh={1.7} mb="md">
            These messages rotate in the sidebar advisor panel that all players
            see. Use sort order to control the sequence. Inactive messages are
            hidden from players but retained for reactivation.
          </Text>

          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : messages.length === 0 ? (
            <Alert color="blue">
              No advisor messages in the database yet. The sidebar currently
              shows hard-coded fallback tips. Add messages here to make them
              admin-managed.
            </Alert>
          ) : (
            <Paper withBorder style={{ overflow: 'hidden' }}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40}>#</Table.Th>
                    <Table.Th>Message</Table.Th>
                    <Table.Th w={80}>Active</Table.Th>
                    <Table.Th w={100}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {messages.map((msg) => (
                    <Table.Tr key={msg.id} opacity={msg.is_active ? 1 : 0.5}>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {msg.sort_order}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={2}>
                          {msg.message}
                        </Text>
                        <Text size="xs" c="dimmed" mt={4}>
                          by {msg.createdBy?.display_name ?? 'Unknown'} &middot;{' '}
                          {new Date(msg.created_at).toLocaleDateString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          size="xs"
                          checked={msg.is_active}
                          onChange={() => toggleActive(msg.id, msg.is_active)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={() => openEdit(msg)}
                            aria-label="Edit"
                          >
                            <FontAwesomeIcon icon={faChessQueen} size="xs" />
                          </ActionIcon>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            onClick={() => handleDelete(msg.id)}
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
          )}
        </GameCard>
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={editId ? 'Edit Advisor Message' : 'New Advisor Message'}
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Message"
            placeholder="A wise advisor tip for players..."
            value={messageText}
            onChange={(e) => setMessageText(e.currentTarget.value)}
            maxLength={500}
          />
          <TextInput
            label="Sort Order"
            description="Lower numbers appear first in rotation"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.currentTarget.value))}
          />
          <Switch
            label="Active (visible to players)"
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editId ? 'Update' : 'Create'}
            </Button>
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

export default AdvisorMessagesPage;
