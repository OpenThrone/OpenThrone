import {
  Button,
  Group,
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
import { logError } from '@/utils/logger';

const ContentManagementPage = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<string>('DRAFT');
  const [kind, setKind] = useState<string>('BLOG');
  const [isPinned, setIsPinned] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/posts');
      if (res.ok) setPosts(await res.json());
    } catch (err) {
      logError('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Title and content are required.',
        color: 'red',
      });
      return;
    }
    try {
      const res = await fetch('/api/admin/content/posts', {
        method: 'POST',
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
          title: 'Published',
          message: 'Content published.',
          color: 'green',
        });
        setTitle('');
        setContent('');
        setExcerpt('');
        setSlug('');
        close();
        fetchPosts();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to publish.',
        color: 'red',
      });
    }
  };

  return (
    <AdminLayout title="Content Management" permissions={['MANAGE_CONTENT']}>
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Manage blog posts, news, and changelog entries.
          </Text>
          <Button onClick={open}>+ New Post</Button>
        </Group>

        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th>Kind</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Author</Table.Th>
                <Table.Th>Published</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {posts.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td fw={700}>{p.title}</Table.Td>
                  <Table.Td>{p.kind}</Table.Td>
                  <Table.Td>{p.status}</Table.Td>
                  <Table.Td>{p.postedBy?.display_name || '—'}</Table.Td>
                  <Table.Td>
                    {p.publishedAt
                      ? new Date(p.publishedAt).toLocaleDateString()
                      : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={close} title="New Post" size="lg">
        <Stack>
          <TextInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <TextInput
            label="Slug (optional)"
            value={slug}
            onChange={(e) => setSlug(e.currentTarget.value)}
          />
          <Textarea
            label="Excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.currentTarget.value)}
          />
          <Textarea
            label="Content (Markdown supported)"
            minRows={8}
            value={content}
            onChange={(e) => setContent(e.currentTarget.value)}
          />
          <Select
            label="Kind"
            data={['BLOG', 'NEWS', 'CHANGELOG']}
            value={kind}
            onChange={(v) => v && setKind(v)}
          />
          <Select
            label="Status"
            data={['DRAFT', 'PUBLISHED', 'ARCHIVED']}
            value={status}
            onChange={(v) => v && setStatus(v)}
          />
          <Switch
            label="Pin to top"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Publish</Button>
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

export default ContentManagementPage;
