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
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
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
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
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
  postedBy?: { id: number; display_name: string };
};

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
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [editorOpened, { open: openEditor, close: closeEditor }] =
    useDisclosure(false);
  const [previewOpened, { open: openPreview, close: closePreview }] =
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
      } else {
        const errData = await res.json().catch(() => ({}));
        notifications.show({
          title: 'Error',
          message:
            errData.error ??
            errData.message ??
            `Failed to load posts (${res.status})`,
          color: 'red',
        });
      }
    } catch (err) {
      logError('Failed to load posts:', err);
      notifications.show({
        title: 'Error',
        message: 'Network error loading posts.',
        color: 'red',
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
    setTitle(post.title);
    setContent(post.content);
    setExcerpt(post.excerpt ?? '');
    setSlug(post.slug ?? '');
    setStatus(post.status);
    setKind(post.kind);
    setIsPinned(post.isPinned);
    openEditor();
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Title and content are required.',
        color: 'red',
      });
      return;
    }
    setSubmitting(true);
    try {
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
        }),
      });
      if (res.ok) {
        notifications.show({
          title: editId ? 'Updated' : 'Created',
          message: `Post ${editId ? 'updated' : 'created'} successfully.`,
          color: 'green',
        });
        closeEditor();
        fetchPosts();
      } else {
        const err = await res.json();
        notifications.show({
          title: 'Error',
          message: err.error ?? 'Failed.',
          color: 'red',
        });
      }
    } catch (err) {
      logError('Failed to save post:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to save.',
        color: 'red',
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
        notifications.show({
          title: 'Updated',
          message: `Post ${newStatus.toLowerCase()}.`,
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
      const res = await fetch(`/api/admin/content/posts/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchPosts();
        notifications.show({
          title: 'Deleted',
          message: 'Post removed.',
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

  const filteredPosts = posts.filter((p) => {
    if (kindFilter && p.kind !== kindFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const pinned = filteredPosts.filter((p) => p.isPinned);
  const unpinned = filteredPosts.filter((p) => !p.isPinned);
  const sorted = [...pinned, ...unpinned];

  return (
    <AdminLayout
      title="Content Management"
      permissions={[PermissionType.MANAGE_CONTENT]}
    >
      <Stack gap="md">
        <GameCard
          title="War Room Dispatches"
          icon={faNewspaper}
          action={
            <Button size="xs" color="yellow" onClick={openCreate}>
              + New Post
            </Button>
          }
        >
          <Text size="sm" c="gray.3" lh={1.7} mb="md">
            Compose and manage news, blog posts, and changelog entries.
            Published posts appear in the War Room Intelligence panel and
            community news feed.
          </Text>

          <Group gap="xs" mb="md">
            <Select
              placeholder="All kinds"
              size="xs"
              w={140}
              clearable
              data={[
                { value: 'NEWS', label: 'News' },
                { value: 'BLOG', label: 'Blog' },
                { value: 'CHANGELOG', label: 'Changelog' },
              ]}
              value={kindFilter}
              onChange={setKindFilter}
            />
            <Select
              placeholder="All statuses"
              size="xs"
              w={140}
              clearable
              data={[
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </Group>

          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : sorted.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No posts yet. Use &quot;+ New Post&quot; above or the community
              news page to create dispatches.
            </Text>
          ) : (
            <ScrollArea>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40}>
                      <FontAwesomeIcon icon={faThumbtack} size="xs" />
                    </Table.Th>
                    <Table.Th>Title</Table.Th>
                    <Table.Th w={90}>Kind</Table.Th>
                    <Table.Th w={100}>Status</Table.Th>
                    <Table.Th w={120}>Author</Table.Th>
                    <Table.Th w={100}>Published</Table.Th>
                    <Table.Th w={120}>Actions</Table.Th>
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
                          {p.kind}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="xs"
                          variant="light"
                          color={statusColor[p.status] ?? 'gray'}
                        >
                          {p.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{p.postedBy?.display_name ?? '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {p.publishedAt
                            ? new Date(p.publishedAt).toLocaleDateString()
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
                            aria-label="Edit"
                          >
                            <FontAwesomeIcon icon={faEdit} size="xs" />
                          </ActionIcon>
                          {p.status !== 'ARCHIVED' && (
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="orange"
                              onClick={() =>
                                handleStatusChange(p.id, 'ARCHIVED')
                              }
                              aria-label="Archive"
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
                              aria-label="Publish"
                              title="Publish"
                            >
                              <FontAwesomeIcon icon={faNewspaper} size="xs" />
                            </ActionIcon>
                          )}
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(p.id)}
                            aria-label="Delete"
                          >
                            <FontAwesomeIcon icon={faTrash} size="xs" />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </GameCard>
      </Stack>

      <Modal
        opened={editorOpened}
        onClose={closeEditor}
        title={editId ? 'Edit Post' : 'New Post'}
        size="xl"
        styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
      >
        <Tabs defaultValue="write">
          <Tabs.List>
            <Tabs.Tab value="write">Write</Tabs.Tab>
            <Tabs.Tab value="preview">Preview</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="write" pt="md">
            <Stack gap="sm">
              <Group grow>
                <TextInput
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                  required
                />
                <Select
                  label="Kind"
                  data={[
                    { value: 'NEWS', label: '📰 News' },
                    { value: 'BLOG', label: '📝 Blog' },
                    { value: 'CHANGELOG', label: '🔧 Changelog' },
                  ]}
                  value={kind}
                  onChange={(v) => v && setKind(v)}
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Slug (optional)"
                  value={slug}
                  onChange={(e) => setSlug(e.currentTarget.value)}
                  placeholder="auto-generated-if-empty"
                />
                <Select
                  label="Status"
                  data={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'PUBLISHED', label: 'Published' },
                    { value: 'ARCHIVED', label: 'Archived' },
                  ]}
                  value={status}
                  onChange={(v) => v && setStatus(v)}
                />
              </Group>
              <Textarea
                label="Excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.currentTarget.value)}
                maxLength={500}
                rows={2}
              />
              <Textarea
                label="Content (Markdown)"
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
              <Switch
                label="Pin to top"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.currentTarget.checked)}
              />
              <Group justify="flex-end" mt="md">
                <Button
                  variant="outline"
                  onClick={closeEditor}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmit} loading={submitting}>
                  {editId
                    ? 'Update'
                    : status === 'PUBLISHED'
                      ? 'Publish'
                      : 'Save Draft'}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="preview" pt="md">
            <Paper
              p="md"
              radius="sm"
              style={{
                backgroundColor: '#0f141a',
                border: '1px solid #2f3e52',
                borderRadius: '6px',
                minHeight: 200,
              }}
            >
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
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                >
                  {content || '*No content yet...*'}
                </ReactMarkdown>
              </div>
            </Paper>
          </Tabs.Panel>
        </Tabs>
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

export default ContentManagementPage;
