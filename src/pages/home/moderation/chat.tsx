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
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';
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
      alertService.notify(
        'success',
        t('chatMutedMessage', { userId: muteUserId, count: muteDuration }),
        { title: t('chatMutedTitle') },
      );
      muteModal.close();
      await fetchMutes();
    } catch (error) {
      logError('Failed to mute user:', error);
      alertService.notify(
        'error',
        error instanceof Error ? error.message : t('chatMuteFailed'),
        { title: t('error') },
      );
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
        alertService.notify('success', t('chatEditedMessage'), {
          title: t('chatEditedTitle'),
        });
        editModal.close();
        await fetchMessages();
      }
    } catch (error) {
      logError('Failed to edit chat message:', error);
      alertService.notify(
        'error',
        error instanceof Error ? error.message : t('chatEditFailed'),
        { title: t('error') },
      );
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
        alertService.notify('success', t('chatDeletedMessage'), {
          title: t('chatDeletedTitle'),
        });
        deleteModal.close();
        await fetchMessages();
      }
    } catch (error) {
      logError('Failed to delete chat message:', error);
      alertService.notify(
        'error',
        error instanceof Error ? error.message : t('chatDeleteFailed'),
        { title: t('error') },
      );
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
        alertService.notify('success', t('chatUnmutedMessage'), {
          title: t('chatUnmutedTitle'),
        });
        await fetchMutes();
      }
    } catch (error) {
      logError('Failed to unmute user:', error);
      alertService.notify(
        'error',
        error instanceof Error ? error.message : t('chatUnmuteFailed'),
        { title: t('error') },
      );
    } finally {
      setMutationLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title={t('chatPageTitle')} permissions={['MODERATE_CHAT']}>
      <Stack gap="md">
        <GameCard title={t('chatSearchTitle')}>
          <Group>
            <TextInput
              placeholder={t('chatSearchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={handleSearch}>{t('chatSearch')}</Button>
          </Group>
        </GameCard>

        <GameCard title={t('chatMessagesTitle', { count: total })}>
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
              {t('chatNoMessages')}
            </Text>
          ) : (
            <Stack gap="md">
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('colId')}</Table.Th>
                    <Table.Th>{t('chatColSender')}</Table.Th>
                    <Table.Th>{t('chatColRoom')}</Table.Th>
                    <Table.Th>{t('chatColContent')}</Table.Th>
                    <Table.Th>{t('chatColSentAt')}</Table.Th>
                    <Table.Th>{t('colStatus')}</Table.Th>
                    <Table.Th>{t('colActions')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {messages.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{m.id}</Table.Td>
                      <Table.Td>
                        {t('chatSender', {
                          name: m.sender?.display_name || t('notAvailable'),
                          id: m.senderId,
                        })}
                      </Table.Td>
                      <Table.Td>{m.roomId}</Table.Td>
                      <Table.Td style={{ maxWidth: 300, overflow: 'hidden' }}>
                        {m.deletedAt ? (
                          <Text c="dimmed" fs="italic">
                            {t('chatDeletedPlaceholder')}
                          </Text>
                        ) : (
                          m.content
                        )}
                      </Table.Td>
                      <Table.Td>{new Date(m.sentAt).toLocaleString()}</Table.Td>
                      <Table.Td>
                        {m.deletedAt && (
                          <Badge color="red">{t('chatBadgeDeleted')}</Badge>
                        )}
                        {m.editReason && !m.deletedAt && (
                          <Badge color="yellow">{t('chatBadgeEdited')}</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {!m.deletedAt && (
                            <Button
                              size="xs"
                              variant="default"
                              onClick={() => openEdit(m)}
                              disabled={mutationLoading}
                              aria-label={t('chatEditAria', { id: m.id })}
                            >
                              {t('chatEdit')}
                            </Button>
                          )}
                          {!m.deletedAt && (
                            <Button
                              size="xs"
                              color="red"
                              onClick={() => openDelete(m.id)}
                              disabled={mutationLoading}
                              aria-label={t('chatDeleteAria', { id: m.id })}
                            >
                              {t('chatDeleteConfirm')}
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() => openMute(m.senderId)}
                            disabled={mutationLoading}
                            aria-label={t('chatMuteAria', { id: m.senderId })}
                          >
                            {t('chatMuteConfirm')}
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

        <GameCard
          title={t('chatActiveMutesTitle', { count: activeMutes.length })}
        >
          {muteLoadError ? (
            <Stack align="center">
              <Text role="alert" c="red">
                {t('muteLoadFailed')}
              </Text>
              <Button onClick={fetchMutes}>{t('retry')}</Button>
            </Stack>
          ) : activeMutes.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              {t('chatNoMutes')}
            </Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('colUserId')}</Table.Th>
                  <Table.Th>{t('reason')}</Table.Th>
                  <Table.Th>{t('chatColStarts')}</Table.Th>
                  <Table.Th>{t('chatColEnds')}</Table.Th>
                  <Table.Th>{t('colAction')}</Table.Th>
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
                        : t('permanent')}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="green"
                        onClick={() => unmute(m.id)}
                        loading={mutationLoading}
                        aria-label={t('chatUnmuteAria', { id: m.userId })}
                      >
                        {t('chatUnmute')}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </GameCard>
      </Stack>

      <ConfirmationModal
        isOpen={muteModalOpen}
        onClose={() => !mutationLoading && muteModal.close()}
        onConfirm={submitMute}
        title={t('chatMuteTitle')}
        type="destructive"
        confirmText={t('chatMuteConfirm')}
        cancelText={t('cancel')}
        isLoading={mutationLoading}
      >
        <NumberInput
          label={t('chatMuteDuration')}
          value={muteDuration}
          onChange={(v) => setMuteDuration(Number(v) || 60)}
          min={5}
          max={10080}
          disabled={mutationLoading}
        />
        <TextInput
          label={t('reason')}
          value={muteReason}
          onChange={(e) => setMuteReason(e.currentTarget.value)}
          disabled={mutationLoading}
        />
      </ConfirmationModal>

      <Modal
        opened={editModalOpen}
        onClose={() => !mutationLoading && editModal.close()}
        title={t('chatEditTitle')}
        centered
        closeOnClickOutside={!mutationLoading}
        closeOnEscape={!mutationLoading}
        withCloseButton={!mutationLoading}
      >
        <Stack>
          <Textarea
            label={t('chatEditContent')}
            minRows={3}
            value={editContent}
            onChange={(e) => setEditContent(e.currentTarget.value)}
          />
          <TextInput
            label={t('chatEditReason')}
            value={editReason}
            onChange={(e) => setEditReason(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={editModal.close}
              disabled={mutationLoading}
            >
              {t('cancel')}
            </Button>
            <Button onClick={submitEdit} loading={mutationLoading}>
              {t('chatEditSave')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => !mutationLoading && deleteModal.close()}
        onConfirm={submitDelete}
        title={t('chatDeleteTitle')}
        message={t('chatDeleteMessage')}
        type="destructive"
        confirmText={t('chatDeleteConfirm')}
        cancelText={t('cancel')}
        isLoading={mutationLoading}
      >
        <TextInput
          label={t('chatDeleteReason')}
          value={deleteReason}
          onChange={(e) => setDeleteReason(e.currentTarget.value)}
          disabled={mutationLoading}
        />
      </ConfirmationModal>
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
