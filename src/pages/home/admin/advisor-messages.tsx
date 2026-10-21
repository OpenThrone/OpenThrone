import { faChessQueen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { getAdminRequestError } from '@/utils/adminRequests';
import { logError } from '@/utils/logger';

const AdvisorMessagesPage = () => {
  const { t } = useTranslation('admin-content');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  const [messageText, setMessageText] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/advisor-messages');
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      setMessages(await res.json());
      setLoadError(false);
    } catch (err) {
      logError('Failed to load advisor messages:', err);
      setLoadError(true);
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
      alertService.notify('error', t('advisorMessages.required'), {
        title: t('advisorMessages.errorTitle'),
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
        alertService.notify(
          'success',
          editId ? t('advisorMessages.updated') : t('advisorMessages.created'),
          {
            title: editId
              ? t('advisorMessages.updatedTitle')
              : t('advisorMessages.createdTitle'),
          },
        );
        close();
        fetchMessages();
      } else {
        throw new Error(await getAdminRequestError(res));
      }
    } catch (err) {
      logError('Failed to save advisor message:', err);
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('advisorMessages.saveFailed'),
        { title: t('advisorMessages.errorTitle') },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: number, current: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/content/advisor-messages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      await fetchMessages();
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('advisorMessages.updateFailed'),
        { title: t('advisorMessages.errorTitle') },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/content/advisor-messages/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      {
        await fetchMessages();
        alertService.notify('success', t('advisorMessages.removed'), {
          title: t('advisorMessages.deletedTitle'),
        });
      }
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('advisorMessages.deleteFailed'),
        { title: t('advisorMessages.errorTitle') },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout
      title={t('advisorMessages.pageTitle')}
      permissions={[PermissionType.MANAGE_CONTENT]}
    >
      <Stack gap="md">
        <GameCard
          title={t('advisorMessages.cardTitle')}
          icon={faChessQueen}
          action={
            <Button size="xs" onClick={openCreate}>
              {t('advisorMessages.new')}
            </Button>
          }
        >
          <Text size="sm" c="gray.3" lh={1.7} mb="md">
            {t('advisorMessages.intro')}
          </Text>

          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : loadError ? (
            <Alert color="red" role="alert">
              {t('advisorMessages.loadError')}{' '}
              <Button variant="default" onClick={fetchMessages}>
                {t('advisorMessages.retry')}
              </Button>
            </Alert>
          ) : messages.length === 0 ? (
            <Alert color="blue">{t('advisorMessages.empty')}</Alert>
          ) : (
            <AdminDataTable
              size="compact"
              ariaLabel={t('advisorMessages.cardTitle')}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>#</Table.Th>
                  <Table.Th>{t('advisorMessages.colMessage')}</Table.Th>
                  <Table.Th w={80}>{t('advisorMessages.colActive')}</Table.Th>
                  <Table.Th w={100}>{t('advisorMessages.colActions')}</Table.Th>
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
                        {t('advisorMessages.byline', {
                          name:
                            msg.createdBy?.display_name ??
                            t('advisorMessages.unknownAuthor'),
                          date: new Date(msg.created_at).toLocaleDateString(),
                        })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        size="xs"
                        checked={msg.is_active}
                        disabled={submitting}
                        onChange={() => toggleActive(msg.id, msg.is_active)}
                        aria-label={
                          msg.is_active
                            ? t('advisorMessages.setInactive', { id: msg.id })
                            : t('advisorMessages.setActive', { id: msg.id })
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() => openEdit(msg)}
                          disabled={submitting}
                          aria-label={t('advisorMessages.editAria', {
                            id: msg.id,
                          })}
                        >
                          <FontAwesomeIcon icon={faChessQueen} size="xs" />
                        </ActionIcon>
                        <Button
                          size="xs"
                          color="red"
                          variant="subtle"
                          onClick={() => setDeleteTarget(msg.id)}
                          disabled={submitting}
                          aria-label={t('advisorMessages.deleteAria', {
                            id: msg.id,
                          })}
                        >
                          {t('advisorMessages.delete')}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AdminDataTable>
          )}
        </GameCard>
      </Stack>

      <Modal
        opened={opened}
        onClose={() => !submitting && close()}
        title={
          editId
            ? t('advisorMessages.editTitle')
            : t('advisorMessages.newTitle')
        }
        size="lg"
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
      >
        <Stack gap="md">
          <TextInput
            label={t('advisorMessages.colMessage')}
            placeholder={t('advisorMessages.placeholder')}
            value={messageText}
            onChange={(e) => setMessageText(e.currentTarget.value)}
            maxLength={500}
          />
          <TextInput
            label={t('advisorMessages.sortOrder')}
            description={t('advisorMessages.sortOrderHint')}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.currentTarget.value))}
          />
          <Switch
            label={t('advisorMessages.activeLabel')}
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              {t('advisorMessages.cancel')}
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editId
                ? t('advisorMessages.update')
                : t('advisorMessages.create')}
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
        title={t('advisorMessages.deleteConfirmTitle')}
        message={t('advisorMessages.deleteConfirmMessage')}
        confirmText={t('advisorMessages.delete')}
        cancelText={t('advisorMessages.cancel')}
        type="destructive"
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

export default AdvisorMessagesPage;
