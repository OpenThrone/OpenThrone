import {
  faEdit,
  faNewspaper,
  faScroll,
  faThumbtack,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import panelClasses from '@/components/game/Panels.module.css';
import MarkdownArticle from '@/components/news/MarkdownArticle';
import { useUser } from '@/context/users';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { getAdminRequestError } from '@/utils/adminRequests';
import { logError } from '@/utils/logger';

type PostData = {
  id: number;
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  status: string;
  kind: string;
  isPinned: boolean;
  publishedAt?: string;
  emailedAt?: string;
  postedBy?: { id: number; display_name: string };
};

const POST_KINDS = ['NEWS', 'BLOG', 'CHANGELOG'] as const;
const POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

const kindColor: Record<string, string> = {
  BLOG: 'blue',
  NEWS: 'yellow',
  CHANGELOG: 'green',
};

const statusColor: Record<string, string> = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'red',
};

const ContentManagementPage = () => {
  const { t, i18n } = useTranslation('admin-content');
  const { user } = useUser();
  const isAdministrator = (user?.staffRoles ?? []).includes('ADMINISTRATOR');
  const [emailCount, setEmailCount] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [editorOpened, { open: openEditor, close: closeEditor }] =
    useDisclosure(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<string>('DRAFT');
  const [kind, setKind] = useState<string>('NEWS');
  const [isPinned, setIsPinned] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/posts');
      if (res.ok) {
        setPosts(await res.json());
        setLoadError(false);
      } else {
        setLoadError(true);
        const errData = await res.json().catch(() => ({}));
        alertService.notify(
          'error',
          errData.error ??
            errData.message ??
            t('content.loadFailedStatus', { status: res.status }),
          { title: t('content.errorTitle') },
        );
      }
    } catch (err) {
      logError('Failed to load posts:', err);
      setLoadError(true);
      alertService.notify('error', t('content.networkError'), {
        title: t('content.errorTitle'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setSendEmail(false);
    setTitle('');
    setContent('');
    setExcerpt('');
    setSlug('');
    setStatus('DRAFT');
    setKind('NEWS');
    setIsPinned(false);
    openEditor();
  };

  const openEditPost = (post: PostData) => {
    setEditId(post.id);
    setSendEmail(false);
    setTitle(post.title);
    setContent(post.content);
    setExcerpt(post.excerpt ?? '');
    setSlug(post.slug ?? '');
    setStatus(post.status);
    setKind(post.kind);
    setIsPinned(post.isPinned);
    openEditor();
  };

  const handleSubmit = async (confirmedEmail = false) => {
    if (submitting) return;
    if (!title.trim() || !content.trim()) {
      alertService.notify('error', t('content.required'), {
        title: t('content.errorTitle'),
      });
      return;
    }
    setSubmitting(true);
    try {
      if (
        sendEmail &&
        isAdministrator &&
        kind === 'NEWS' &&
        status === 'PUBLISHED' &&
        !confirmedEmail
      ) {
        const res = await fetch('/api/admin/content/posts?emailCount=true');
        if (!res.ok) throw new Error(await getAdminRequestError(res));
        const data = await res.json();
        setEmailCount(data.count);
        return;
      }
      const url = editId
        ? `/api/admin/content/posts/${editId}`
        : '/api/admin/content/posts';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          excerpt: excerpt || undefined,
          slug: slug || undefined,
          status,
          kind,
          isPinned,
          sendEmail:
            sendEmail &&
            isAdministrator &&
            kind === 'NEWS' &&
            status === 'PUBLISHED',
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        if (saved.emailAlreadySent)
          alertService.notify('info', t('emailAdmin.alreadySent'));
        alertService.notify(
          'success',
          t(editId ? 'content.updatedMessage' : 'content.createdMessage'),
          {
            title: t(editId ? 'content.updatedTitle' : 'content.createdTitle'),
          },
        );
        setEmailCount(null);
        closeEditor();
        fetchPosts();
      } else {
        alertService.notify('error', await getAdminRequestError(res), {
          title: t('content.errorTitle'),
        });
      }
    } catch (err) {
      logError('Failed to save post:', err);
      alertService.notify('error', t('content.saveFailed'), {
        title: t('content.errorTitle'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/content/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchPosts();
        alertService.notify(
          'success',
          t('content.statusChanged', {
            status: t(`content.statuses.${newStatus}`),
          }),
          { title: t('content.updatedTitle') },
        );
      } else {
        throw new Error(await getAdminRequestError(res));
      }
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('content.updateFailed'),
        { title: t('content.errorTitle') },
      );
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/content/posts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      {
        await fetchPosts();
        alertService.notify('success', t('content.deletedMessage'), {
          title: t('content.deletedTitle'),
        });
      }
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('content.deleteFailed'),
        { title: t('content.errorTitle') },
      );
    }
  };

  const filteredPosts = posts.filter((p) => {
    if (kindFilter && p.kind !== kindFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const kindOptions = POST_KINDS.map((value) => ({
    value,
    label: t(`content.kinds.${value}`),
  }));
  const statusOptions = POST_STATUSES.map((value) => ({
    value,
    label: t(`content.statuses.${value}`),
  }));

  const pinned = filteredPosts.filter((p) => p.isPinned);
  const unpinned = filteredPosts.filter((p) => !p.isPinned);
  const sorted = [...pinned, ...unpinned];

  return (
    <AdminLayout
      title={t('content.pageTitle')}
      permissions={[PermissionType.MANAGE_CONTENT]}
    >
      <Stack gap="md">
        <GameCard
          title={t('content.dispatches')}
          icon={faNewspaper}
          action={
            <Button size="xs" onClick={openCreate}>
              {t('content.newPost')}
            </Button>
          }
        >
          <Text size="sm" c="gray.3" lh={1.7} mb="md">
            {t('content.intro')}
          </Text>

          <Group gap="xs" mb="md">
            <Select
              placeholder={t('content.allKinds')}
              aria-label={t('content.kind')}
              size="xs"
              w={{ base: '100%', sm: 140 }}
              clearable
              data={kindOptions}
              value={kindFilter}
              onChange={setKindFilter}
            />
            <Select
              placeholder={t('content.allStatuses')}
              aria-label={t('content.status')}
              size="xs"
              w={{ base: '100%', sm: 140 }}
              clearable
              data={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </Group>

          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : loadError ? (
            <Alert color="red" role="alert">
              {t('content.loadFailed')}{' '}
              <Button variant="default" onClick={fetchPosts}>
                {t('request.retry')}
              </Button>
            </Alert>
          ) : sorted.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {t('content.empty')}
            </Text>
          ) : (
            <AdminDataTable ariaLabel={t('content.dispatches')}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <FontAwesomeIcon
                      icon={faThumbtack}
                      size="xs"
                      title={t('content.pinned')}
                    />
                  </Table.Th>
                  <Table.Th>{t('content.title')}</Table.Th>
                  <Table.Th w={90}>{t('content.kind')}</Table.Th>
                  <Table.Th w={100}>{t('content.status')}</Table.Th>
                  <Table.Th w={120}>{t('content.author')}</Table.Th>
                  <Table.Th w={100}>{t('content.published')}</Table.Th>
                  <Table.Th w={120}>{t('content.actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sorted.map((p) => (
                  <Table.Tr
                    key={p.id}
                    opacity={p.status === 'ARCHIVED' ? 0.5 : 1}
                  >
                    <Table.Td>
                      {p.isPinned && (
                        <Text c="yellow" fw={700}>
                          <FontAwesomeIcon icon={faThumbtack} size="xs" />
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600} lineClamp={1}>
                        {p.title}
                      </Text>
                      {p.emailedAt && (
                        <Text size="xs" c="dimmed">
                          {t('emailAdmin.emailedOn', {
                            date: new Date(p.emailedAt).toLocaleDateString(
                              i18n.language,
                            ),
                          })}
                        </Text>
                      )}
                      {p.excerpt && (
                        <Text size="xs" c="dimmed" lineClamp={1} mt={2}>
                          {p.excerpt}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        variant="light"
                        color={kindColor[p.kind] ?? 'gray'}
                      >
                        {t(`content.kinds.${p.kind}`, { defaultValue: p.kind })}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        variant="light"
                        color={statusColor[p.status] ?? 'gray'}
                      >
                        {t(`content.statuses.${p.status}`, {
                          defaultValue: p.status,
                        })}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{p.postedBy?.display_name ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {p.publishedAt
                          ? new Date(p.publishedAt).toLocaleDateString(
                              i18n.language,
                            )
                          : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() => openEditPost(p)}
                          aria-label={t('content.edit')}
                        >
                          <FontAwesomeIcon icon={faEdit} size="xs" />
                        </ActionIcon>
                        {p.status !== 'ARCHIVED' && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="orange"
                            onClick={() => handleStatusChange(p.id, 'ARCHIVED')}
                            aria-label={t('content.archive')}
                          >
                            <FontAwesomeIcon icon={faScroll} size="xs" />
                          </ActionIcon>
                        )}
                        {p.status === 'DRAFT' && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="green"
                            onClick={() =>
                              handleStatusChange(p.id, 'PUBLISHED')
                            }
                            aria-label={t('content.publish')}
                            title={t('content.publish')}
                          >
                            <FontAwesomeIcon icon={faNewspaper} size="xs" />
                          </ActionIcon>
                        )}
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => setDeleteTarget(p.id)}
                          aria-label={t('content.delete')}
                        >
                          <FontAwesomeIcon icon={faTrash} size="xs" />
                        </ActionIcon>
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
        opened={editorOpened}
        onClose={() => !submitting && closeEditor()}
        title={t(editId ? 'content.editPost' : 'content.newPostTitle')}
        size="xl"
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
        styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
      >
        <Tabs defaultValue="write">
          <Tabs.List>
            <Tabs.Tab value="write">{t('content.write')}</Tabs.Tab>
            <Tabs.Tab value="preview">{t('content.preview')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="write" pt="md">
            <Stack gap="sm">
              <Group grow>
                <TextInput
                  label={t('content.title')}
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                  required
                />
                <Select
                  label={t('content.kind')}
                  data={kindOptions}
                  value={kind}
                  onChange={(v) => v && setKind(v)}
                />
              </Group>
              <Group grow>
                <TextInput
                  label={t('content.slug')}
                  value={slug}
                  onChange={(e) => setSlug(e.currentTarget.value)}
                  placeholder={t('content.slugPlaceholder')}
                />
                <Select
                  label={t('content.status')}
                  data={statusOptions}
                  value={status}
                  onChange={(v) => v && setStatus(v)}
                />
              </Group>
              <Textarea
                label={t('content.excerpt')}
                value={excerpt}
                onChange={(e) => setExcerpt(e.currentTarget.value)}
                maxLength={500}
                rows={2}
              />
              <Textarea
                label={t('content.body')}
                value={content}
                onChange={(e) => setContent(e.currentTarget.value)}
                minRows={12}
                autosize
                maxRows={30}
                required
                styles={{
                  input: { fontFamily: 'monospace', fontSize: '13px' },
                }}
              />
              {isAdministrator && kind === 'NEWS' && status === 'PUBLISHED' && (
                <Switch
                  label={t('emailAdmin.alsoEmail')}
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.currentTarget.checked)}
                />
              )}
              <Switch
                label={t('content.pin')}
                checked={isPinned}
                onChange={(e) => setIsPinned(e.currentTarget.checked)}
              />
              <Group justify="flex-end" mt="md">
                <Button
                  variant="default"
                  onClick={closeEditor}
                  disabled={submitting}
                >
                  {t('content.cancel')}
                </Button>
                <Button onClick={() => handleSubmit()} loading={submitting}>
                  {editId
                    ? t('content.update')
                    : status === 'PUBLISHED'
                      ? t('content.publish')
                      : t('content.saveDraft')}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="preview" pt="md">
            <Box className={panelClasses.insetRow} p="md" mih={200}>
              {title && (
                <Title
                  order={3}
                  c="gray.2"
                  mb="sm"
                  style={{ fontFamily: 'MedievalSharp, serif' }}
                >
                  {title}
                </Title>
              )}
              <MarkdownArticle content={content || t('content.previewEmpty')} />
            </Box>
          </Tabs.Panel>
        </Tabs>
      </Modal>
      <ConfirmationModal
        isOpen={emailCount !== null}
        onClose={() => !submitting && setEmailCount(null)}
        onConfirm={() => handleSubmit(true)}
        title={t('emailAdmin.confirm')}
        message={t('emailAdmin.confirmNewsEmail', { count: emailCount ?? 0 })}
        confirmText={t('emailAdmin.send')}
        cancelText={t('emailAdmin.cancel')}
        isLoading={submitting}
        type="primary"
      />
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title={t('content.deleteTitle')}
        message={t('content.deleteMessage')}
        confirmText={t('content.delete')}
        cancelText={t('content.cancel')}
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

export default ContentManagementPage;
