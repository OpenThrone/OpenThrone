import { faThumbtack } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Anchor, Badge, Card, Group, Text, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

import {
  type AllianceAnnouncementItem,
  announcementListUrl,
} from '@/components/alliance/AllianceAnnouncements';

interface AllianceLatestAnnouncementProps {
  allianceId: number;
  onViewAll: () => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

/** Compact Overview card: the latest pinned announcement, else the newest. */
export const AllianceLatestAnnouncement = ({
  allianceId,
  onViewAll,
}: AllianceLatestAnnouncementProps) => {
  const { t } = useTranslation('allianceAnnouncements');
  // The list is ordered pinned first, then newest, so the first item wins.
  const { data } = useSWR<{ items: AllianceAnnouncementItem[] }>(
    announcementListUrl(allianceId, 1, 1),
    fetcher,
  );
  const latest = data?.items?.[0];
  if (!latest) return null;

  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" mb="xs">
        <Title order={4}>{t('overview.heading')}</Title>
        {latest.pinned && (
          <Badge
            color="yellow"
            variant="light"
            leftSection={<FontAwesomeIcon icon={faThumbtack} />}
          >
            {t('list.pinned')}
          </Badge>
        )}
      </Group>
      <Text fw={600}>{latest.title}</Text>
      <Text size="xs" c="dimmed" mb="xs">
        {t('list.by', {
          name: latest.author?.display_name ?? t('list.unknownAuthor'),
        })}{' '}
        · {new Date(latest.created_at).toLocaleString()}
      </Text>
      <Text
        lineClamp={4}
        style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {latest.body}
      </Text>
      <Anchor
        component="button"
        type="button"
        size="sm"
        mt="sm"
        onClick={onViewAll}
      >
        {t('overview.viewAll')}
      </Anchor>
    </Card>
  );
};
