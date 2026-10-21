import { faThumbtack, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { ConfirmActionModal } from '@/components/alliance/ConfirmActionModal';
import { GameCard } from '@/components/game/GameCard';
import { SectionHeading } from '@/components/game/SectionHeading';
import { alertService } from '@/services/Alert.service';

const TITLE_MAX = 120;
const BODY_MAX = 4000;
const PAGE_SIZE = 10;
const LIST_URL = '/api/alliances/announcements/list';

export interface AllianceAnnouncementItem {
  id: number;
  author_id: number;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author?: { id: number; display_name: string | null } | null;
}

interface AnnouncementListResponse {
  items: AllianceAnnouncementItem[];
  total: number;
  page: number;
  pageSize: number;
  canPost: boolean;
}

const fetcher = async (url: string): Promise<AnnouncementListResponse> => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

/** Revalidates every cached announcement list (tab and overview card). */
export const refreshAnnouncements = () =>
  globalMutate(
    (key) => typeof key === 'string' && key.startsWith(LIST_URL),
    undefined,
    { revalidate: true },
  );

export const announcementListUrl = (
  allianceId: number,
  page: number,
  pageSize: number,
) => `${LIST_URL}?allianceId=${allianceId}&page=${page}&pageSize=${pageSize}`;

interface AllianceAnnouncementsProps {
  allianceId: number;
  viewerId: number | null;
}

/** Announcements tab: compose form (post_announcements) and the list. */
export const AllianceAnnouncements = ({
  allianceId,
  viewerId,
}: AllianceAnnouncementsProps) => {
  const { t } = useTranslation('allianceAnnouncements');
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<AllianceAnnouncementItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, error } = useSWR(
    announcementListUrl(allianceId, page, PAGE_SIZE),
    fetcher,
  );
  const canPost = data?.canPost ?? false;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await allianceRequest(
        '/api/alliances/announcements/create',
        {
          allianceId,
          title,
          body,
        },
      );
      alertService.success(
        t('compose.posted', { count: result?.delivered ?? 0 }),
      );
      setTitle('');
      setBody('');
      setPage(1);
      await refreshAnnouncements();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePin = async (item: AllianceAnnouncementItem) => {
    try {
      await allianceRequest('/api/alliances/announcements/pin', {
        allianceId,
        announcementId: item.id,
        pinned: !item.pinned,
      });
      alertService.success(item.pinned ? t('unpinnedToast') : t('pinnedToast'));
      await refreshAnnouncements();
    } catch (err: any) {
      alertService.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await allianceRequest('/api/alliances/announcements/delete', {
        allianceId,
        announcementId: pendingDelete.id,
      });
      alertService.success(t('deletedToast'));
      setPendingDelete(null);
      await refreshAnnouncements();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack gap="md">
      {canPost && (
        <GameCard title={t('compose.heading')}>
          <form onSubmit={handleSubmit}>
            <Stack gap="sm">
              <TextInput
                label={t('compose.titleLabel')}
                placeholder={t('compose.titlePlaceholder')}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.currentTarget.value)}
                description={t('compose.counter', {
                  count: title.length,
                  max: TITLE_MAX,
                })}
                required
              />
              <Textarea
                label={t('compose.bodyLabel')}
                placeholder={t('compose.bodyPlaceholder')}
                value={body}
                maxLength={BODY_MAX}
                autosize
                minRows={4}
                maxRows={12}
                onChange={(e) => setBody(e.currentTarget.value)}
                description={t('compose.counter', {
                  count: body.length,
                  max: BODY_MAX,
                })}
                required
              />
              <Text size="xs" c="dimmed">
                {t('compose.hint')}
              </Text>
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={!title.trim() || !body.trim()}
                >
                  {t('compose.submit')}
                </Button>
              </Group>
            </Stack>
          </form>
        </GameCard>
      )}

      <GameCard title={t('title')}>
        <Stack gap="md">
          {error && (
            <Text c="red" role="alert">
              {t('loadError')}
            </Text>
          )}
          {data && data.items.length === 0 && (
            <Text c="dimmed">{t('list.empty')}</Text>
          )}

          {data?.items.map((item) => {
            const canDelete = canPost || item.author_id === viewerId;
            return (
              <Card key={item.id} withBorder padding="lg" radius="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Group gap="xs">
                      <SectionHeading>{item.title}</SectionHeading>
                      {item.pinned && (
                        <Badge
                          color="yellow"
                          variant="light"
                          leftSection={<FontAwesomeIcon icon={faThumbtack} />}
                        >
                          {t('list.pinned')}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t('list.by', {
                        name:
                          item.author?.display_name ?? t('list.unknownAuthor'),
                      })}{' '}
                      · {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </Stack>
                  <Group gap={4} wrap="nowrap">
                    {canPost && (
                      <Tooltip
                        label={item.pinned ? t('list.unpin') : t('list.pin')}
                      >
                        <ActionIcon
                          variant={item.pinned ? 'filled' : 'subtle'}
                          color="yellow"
                          aria-label={
                            item.pinned ? t('list.unpin') : t('list.pin')
                          }
                          onClick={() => handlePin(item)}
                        >
                          <FontAwesomeIcon icon={faThumbtack} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip label={t('list.delete')}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t('list.delete')}
                          onClick={() => setPendingDelete(item)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
                {/* Plain text only: React escapes it; pre-wrap keeps line breaks. */}
                <Text
                  mt="sm"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {item.body}
                </Text>
              </Card>
            );
          })}

          {totalPages > 1 && (
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              aria-label={t('list.pageLabel')}
            />
          )}
        </Stack>
      </GameCard>

      <ConfirmActionModal
        opened={pendingDelete !== null}
        title={t('deleteConfirm.title')}
        message={t('deleteConfirm.message', { title: pendingDelete?.title })}
        confirmLabel={t('deleteConfirm.confirm')}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />
    </Stack>
  );
};
