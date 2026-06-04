import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Pagination,
  Stack,
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
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

const ChatModerationPage = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [total, setTotal] = useState(0);
  const [muteUserId, setMuteUserId] = useState<number | null>(null);
  const [muteDuration, setMuteDuration] = useState<number>(60);
  const [muteReason, setMuteReason] = useState('');
  const [editMessageId, setEditMessageId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editReason, setEditReason] = useState('');
  const [deleteMessageId, setDeleteMessageId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [muteModalOpen, muteModal] = useDisclosure(false);
  const [editModalOpen, editModal] = useDisclosure(false);
  const [deleteModalOpen, deleteModal] = useDisclosure(false);
  const [activeMutes, setActiveMutes] = useState<any[]>([]);

  const limit = 20;

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });
      if (searchTerm) params.append('search', searchTerm);
      const res = await fetch(
        `/api/admin/moderation/chat/logs?${params.toString()}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      logError('Failed to load chat logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMutes = async () => {
    try {
      const res = await fetch('/api/admin/moderation/chat/mutes/list');
      if (res.ok) {
        const data = await res.json();
        setActiveMutes(data);
      }
    } catch (err) {
      logError('Failed to load mutes:', err);
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchMutes();
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchMessages();
  };

  const openMute = (userId: number) => {
    setMuteUserId(userId);
    setMuteDuration(60);
    setMuteReason('');
    muteModal.open();
  };

  const submitMute = async () => {
    if (!muteUserId) return;
    try {
      const res = await fetch('/api/admin/moderation/chat/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: muteUserId,
          reason: muteReason || undefined,
          durationMinutes: muteDuration,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Muted',
          message: `User ${muteUserId} muted for ${muteDuration} minutes.`,
          color: 'green',
        });
        muteModal.close();
        fetchMutes();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to mute user.',
        color: 'red',
      });
    }
  };

  const openEdit = (msg: any) => {
    setEditMessageId(msg.id);
    setEditContent(msg.content);
    setEditReason('');
    editModal.open();
  };

  const submitEdit = async () => {
    if (!editMessageId) return;
    try {
      const res = await fetch('/api/admin/moderation/chat/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: editMessageId,
          content: editContent,
          reason: editReason,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Edited',
          message: 'Message edited.',
          color: 'green',
        });
        editModal.close();
        fetchMessages();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to edit.',
        color: 'red',
      });
    }
  };

  const openDelete = (messageId: number) => {
    setDeleteMessageId(messageId);
    setDeleteReason('');
    deleteModal.open();
  };

  const submitDelete = async () => {
    if (!deleteMessageId) return;
    try {
      const res = await fetch('/api/admin/moderation/chat/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: deleteMessageId,
          reason: deleteReason,
        }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Deleted',
          message: 'Message removed.',
          color: 'green',
        });
        deleteModal.close();
        fetchMessages();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete.',
        color: 'red',
      });
    }
  };

  const unmute = async (muteId: number) => {
    try {
      const res = await fetch('/api/admin/moderation/chat/unmute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muteId }),
      });
      if (res.ok) {
        notifications.show({
          title: 'Unmuted',
          message: 'User unmuted.',
          color: 'green',
        });
        fetchMutes();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to unmute.',
        color: 'red',
      });
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title="Moderation: Chat" permissions={['MODERATE_CHAT']}>
      <Stack gap="md">
        <GameCard title="Search Chat Logs">
          <Group>
            <TextInput
              placeholder="Search by user ID or content"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={handleSearch}>Search</Button>
          </Group>
        </GameCard>

        <GameCard title={`Messages (${total})`}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : messages.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              No messages found.
            </Text>
          ) : (
            <Stack gap="md">
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Sender</Table.Th>
                    <Table.Th>Room</Table.Th>
                    <Table.Th>Content</Table.Th>
                    <Table.Th>Sent At</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {messages.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{m.id}</Table.Td>
                      <Table.Td>
                        {m.sender?.display_name || 'N/A'} (ID: {m.senderId})
                      </Table.Td>
                      <Table.Td>{m.roomId}</Table.Td>
                      <Table.Td style={{ maxWidth: 300, overflow: 'hidden' }}>
                        {m.deletedAt ? (
                          <Text c="dimmed" fs="italic">
                            [deleted]
                          </Text>
                        ) : (
                          m.content
                        )}
                      </Table.Td>
                      <Table.Td>{new Date(m.sentAt).toLocaleString()}</Table.Td>
                      <Table.Td>
                        {m.deletedAt && <Badge color="red">Deleted</Badge>}
                        {m.editReason && !m.deletedAt && (
                          <Badge color="yellow">Edited</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {!m.deletedAt && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => openEdit(m)}
                            >
                              Edit
                            </Button>
                          )}
                          {!m.deletedAt && (
                            <Button
                              size="xs"
                              color="red"
                              variant="outline"
                              onClick={() => openDelete(m.id)}
                            >
                              Delete
                            </Button>
                          )}
                          <Button
                            size="xs"
                            color="orange"
                            variant="subtle"
                            onClick={() => openMute(m.senderId)}
                          >
                            Mute
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {totalPages > 1 && (
                <Group justify="center">
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                  />
                </Group>
              )}
            </Stack>
          )}
        </GameCard>

        <GameCard title={`Active Mutes (${activeMutes.length})`}>
          {activeMutes.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              No active mutes.
            </Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User ID</Table.Th>
                  <Table.Th>Reason</Table.Th>
                  <Table.Th>Starts</Table.Th>
                  <Table.Th>Ends</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {activeMutes.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td>{m.userId}</Table.Td>
                    <Table.Td>{m.reason || '—'}</Table.Td>
                    <Table.Td>{new Date(m.startsAt).toLocaleString()}</Table.Td>
                    <Table.Td>
                      {m.endsAt
                        ? new Date(m.endsAt).toLocaleString()
                        : 'Permanent'}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="green"
                        onClick={() => unmute(m.id)}
                      >
                        Unmute
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </GameCard>
      </Stack>

      <Modal opened={muteModalOpen} onClose={muteModal.close} title="Mute User">
        <Stack>
          <NumberInput
            label="Duration (minutes)"
            value={muteDuration}
            onChange={(v) => setMuteDuration(Number(v) || 60)}
            min={5}
            max={10080}
          />
          <TextInput
            label="Reason"
            value={muteReason}
            onChange={(e) => setMuteReason(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={muteModal.close}>
              Cancel
            </Button>
            <Button color="orange" onClick={submitMute}>
              Mute
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={editModalOpen}
        onClose={editModal.close}
        title="Edit Message"
      >
        <Stack>
          <Textarea
            label="New Content"
            minRows={3}
            value={editContent}
            onChange={(e) => setEditContent(e.currentTarget.value)}
          />
          <TextInput
            label="Edit Reason"
            value={editReason}
            onChange={(e) => setEditReason(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={editModal.close}>
              Cancel
            </Button>
            <Button color="yellow" onClick={submitEdit}>
              Save Edit
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpen}
        onClose={deleteModal.close}
        title="Delete Message"
      >
        <Stack>
          <Text size="sm">
            This will soft-delete the message. The original content will be
            preserved in the audit trail.
          </Text>
          <TextInput
            label="Delete Reason"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={deleteModal.close}>
              Cancel
            </Button>
            <Button color="red" onClick={submitDelete}>
              Delete
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

export default ChatModerationPage;
