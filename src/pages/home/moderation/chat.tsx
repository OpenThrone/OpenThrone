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
import { useTranslation } from 'next-i18next';
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
  const [loadError, setLoadError] = useState(false);
  const [muteLoadError, setMuteLoadError] = useState(false);
  const [mutationLoading, setMutationLoading] = useState(false);
  const { t } = useTranslation('moderation-admin');

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setTotal(data.total || 0);
      setLoadError(false);
    } catch (err) {
      logError('Failed to load chat logs:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchMutes = async () => {
    try {
      const res = await fetch('/api/admin/moderation/chat/mutes/list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActiveMutes(await res.json());
      setMuteLoadError(false);
    } catch (err) {
      logError('Failed to load mutes:', err);
      setMuteLoadError(true);
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
    if (mutationLoading) return;
    setMutationLoading(true);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notifications.show({
        title: 'Muted',
        message: `User ${muteUserId} muted for ${muteDuration} minutes.`,
        color: 'green',
      });
      muteModal.close();
      await fetchMutes();
    } catch (error) {
      logError('Failed to mute user:', error);
      notifications.show({
        title: 'Error',
        message:
          error instanceof Error ? error.message : 'Failed to mute user.',
        color: 'red',
      });
    } finally {
      setMutationLoading(false);
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
    if (mutationLoading) return;
    setMutationLoading(true);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      {
        notifications.show({
          title: 'Edited',
          message: 'Message edited.',
          color: 'green',
        });
        editModal.close();
        await fetchMessages();
      }
    } catch (error) {
      logError('Failed to edit chat message:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to edit.',
        color: 'red',
      });
    } finally {
      setMutationLoading(false);
    }
  };

  const openDelete = (messageId: number) => {
    setDeleteMessageId(messageId);
    setDeleteReason('');
    deleteModal.open();
  };

  const submitDelete = async () => {
    if (!deleteMessageId) return;
    if (mutationLoading) return;
    setMutationLoading(true);
    try {
      const res = await fetch('/api/admin/moderation/chat/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: deleteMessageId,
          reason: deleteReason,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      {
        notifications.show({
          title: 'Deleted',
          message: 'Message removed.',
          color: 'green',
        });
        deleteModal.close();
        await fetchMessages();
      }
    } catch (error) {
      logError('Failed to delete chat message:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete.',
        color: 'red',
      });
    } finally {
      setMutationLoading(false);
    }
  };

  const unmute = async (muteId: number) => {
    if (mutationLoading) return;
    setMutationLoading(true);
    try {
      const res = await fetch('/api/admin/moderation/chat/unmute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muteId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      {
        notifications.show({
          title: 'Unmuted',
          message: 'User unmuted.',
          color: 'green',
        });
        await fetchMutes();
      }
    } catch (error) {
      logError('Failed to unmute user:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to unmute.',
        color: 'red',
      });
    } finally {
      setMutationLoading(false);
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
          ) : loadError ? (
            <Stack align="center">
              <Text role="alert" c="red">
                {t('chatLoadFailed')}
              </Text>
              <Button onClick={fetchMessages}>{t('retry')}</Button>
            </Stack>
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
                              disabled={mutationLoading}
                              aria-label={`Edit message ${m.id}`}
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
                              disabled={mutationLoading}
                              aria-label={`Delete message ${m.id}`}
                            >
                              Delete
                            </Button>
                          )}
                          <Button
                            size="xs"
                            color="orange"
                            variant="subtle"
                            onClick={() => openMute(m.senderId)}
                            disabled={mutationLoading}
                            aria-label={`Mute user ${m.senderId}`}
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
          {muteLoadError ? (
            <Stack align="center">
              <Text role="alert" c="red">
                {t('muteLoadFailed')}
              </Text>
              <Button onClick={fetchMutes}>{t('retry')}</Button>
            </Stack>
          ) : activeMutes.length === 0 ? (
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
                        loading={mutationLoading}
                        aria-label={`Unmute user ${m.userId}`}
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
            <Button
              color="orange"
              onClick={submitMute}
              loading={mutationLoading}
            >
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
            <Button
              color="yellow"
              onClick={submitEdit}
              loading={mutationLoading}
            >
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
            <Button
              color="red"
              onClick={submitDelete}
              loading={mutationLoading}
            >
              Delete
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
        'moderation-admin',
      ])),
    },
  };
};

export default ChatModerationPage;
