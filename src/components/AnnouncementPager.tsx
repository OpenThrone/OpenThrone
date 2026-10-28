import {
  faChevronLeft,
  faChevronRight,
  faClockRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import type { NewsBulletinSeverity } from '@/components/news-bulletin';
import NewsBulletin from '@/components/news-bulletin';
import { useAnnouncementOrder } from '@/hooks/useAnnouncementOrder';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  severity?: string | null;
  dismissible?: boolean;
  linkUrl?: string | null;
  createdAt?: string;
}

const PRIORITY: NewsBulletinSeverity[] = [
  'CRITICAL',
  'WARNING',
  'INFO',
  'SUCCESS',
];
const severityOf = (item: Announcement): NewsBulletinSeverity =>
  PRIORITY.includes(item.severity as NewsBulletinSeverity)
    ? (item.severity as NewsBulletinSeverity)
    : 'INFO';

/** Compact bulletin with navigation and a recoverable dismissed view inside its frame. */
export default function AnnouncementPager({
  announcements,
  dismissed = new Set<number>(),
  onDismiss,
  onRestore,
}: {
  announcements: Announcement[];
  dismissed?: ReadonlySet<number>;
  onDismiss: (id: number) => void;
  onRestore?: (id: number) => void;
}) {
  const { t } = useTranslation('common');
  const [order] = useAnnouncementOrder();
  const [showDismissed, setShowDismissed] = useState(false);
  const [page, setPage] = useState(0);
  const dismissedCount = announcements.filter((a) =>
    dismissed.has(a.id),
  ).length;
  const activeCount = announcements.length - dismissedCount;
  const sorted = announcements
    .filter((a) => dismissed.has(a.id) === showDismissed)
    .sort((a, b) => {
      const priority =
        order === 'newest'
          ? 0
          : PRIORITY.indexOf(severityOf(a)) - PRIORITY.indexOf(severityOf(b));
      return (
        priority ||
        (Date.parse(b.createdAt ?? '') || b.id) -
          (Date.parse(a.createdAt ?? '') || a.id)
      );
    });
  const index = Math.min(page, Math.max(0, sorted.length - 1));
  const current = sorted[index];
  const toggleView = () => {
    setShowDismissed(!showDismissed);
    setPage(0);
  };
  const historyLabel = showDismissed
    ? t('announcementsFeed.showActive', { count: activeCount })
    : t('announcementsFeed.showDismissed', { count: dismissedCount });

  if (!current) {
    if (!announcements.length) return null;
    return (
      <Group mx={{ base: 0, sm: 16 }} my="xs">
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={toggleView}
          leftSection={<FontAwesomeIcon icon={faClockRotateLeft} />}
        >
          {historyLabel}
        </Button>
      </Group>
    );
  }

  return (
    <NewsBulletin
      {...current}
      severity={severityOf(current)}
      compact
      dismissible={!showDismissed && current.dismissible !== false}
      onDismiss={() => onDismiss(current.id)}
      controls={
        <Group gap={6} justify="space-between" wrap="wrap">
          <Group gap={6}>
            {(dismissedCount > 0 || showDismissed) && (
              <Tooltip
                label={historyLabel}
                events={{ hover: true, focus: true, touch: true }}
              >
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={historyLabel}
                  onClick={toggleView}
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </ActionIcon>
              </Tooltip>
            )}
            {showDismissed && (
              <Text size="xs" c="var(--ot-body)">
                {t('announcementsFeed.dismissed')}
              </Text>
            )}
            {showDismissed && onRestore && (
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => onRestore(current.id)}
              >
                {t('announcementsFeed.restore')}
              </Button>
            )}
          </Group>
          <Group gap={6}>
            {sorted.length > 1 && (
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={t('announcementsFeed.previous')}
                disabled={index === 0}
                onClick={() => setPage(index - 1)}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </ActionIcon>
            )}
            <Text size="xs" c="var(--ot-body)" aria-live="polite">
              {t('announcementsFeed.page', {
                current: index + 1,
                total: sorted.length,
              })}
            </Text>
            {sorted.length > 1 && (
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={t('announcementsFeed.next')}
                disabled={index === sorted.length - 1}
                onClick={() => setPage(index + 1)}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </ActionIcon>
            )}
          </Group>
        </Group>
      }
    />
  );
}
