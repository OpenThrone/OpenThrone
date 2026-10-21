import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Accordion,
  Anchor,
  Badge,
  Group,
  Space,
  Stack,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { GameCard } from '@/components/game/GameCard';
import MarkdownArticle from '@/components/news/MarkdownArticle';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  created_timestamp: string;
  read: boolean;
  kind?: string;
  isPinned?: boolean;
}

interface StyledNewsProps {
  news: NewsItem[];
}

const kindBadgeColor: Record<string, string> = {
  NEWS: 'yellow',
  BLOG: 'blue',
  CHANGELOG: 'green',
};

/** Styled news. */
export const StyledNews: React.FC<StyledNewsProps> = ({ news }) => {
  const { t } = useTranslation('home');
  if (news.length === 0) {
    return (
      <GameCard title={t('dispatches.title')} icon={faScroll}>
        <Text size="sm" c="var(--ot-muted)" ta="center" py="lg">
          {t('dispatches.empty')}
        </Text>
      </GameCard>
    );
  }

  const sorted = [...news].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  return (
    <GameCard title={t('dispatches.title')} icon={faScroll}>
      <Accordion
        variant="contained"
        defaultValue={
          sorted.find((n) => !n.read)?.id?.toString() ??
          sorted[0]?.id?.toString()
        }
        styles={{
          item: {
            backgroundColor: 'var(--ot-inset)',
            border: '1px solid var(--ot-line)',
            borderRadius: 'var(--mantine-radius-sm)',
            marginBottom: '4px',
          },
          control: {
            padding: '10px 14px',
          },
          content: {
            padding: '4px 14px 14px',
          },
        }}
      >
        {sorted.map((item) => (
          <Accordion.Item key={item.id} value={item.id.toString()}>
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap">
                  {item.isPinned && (
                    <FontAwesomeIcon
                      icon={faScroll}
                      size="xs"
                      style={{ color: 'var(--ot-accent)' }}
                      aria-hidden="true"
                    />
                  )}
                  <Text size="sm" fw={600} c="var(--ot-body)" lineClamp={1}>
                    {item.title}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {!item.read && (
                    <Badge size="xs" color="yellow" variant="filled">
                      {t('dispatches.new')}
                    </Badge>
                  )}
                  {item.kind && kindBadgeColor[item.kind] && (
                    <Badge
                      size="xs"
                      variant="light"
                      color={kindBadgeColor[item.kind]}
                    >
                      {item.kind}
                    </Badge>
                  )}
                  <Text size="xs" c="var(--ot-muted)">
                    {new Date(item.created_timestamp).toLocaleDateString()}
                  </Text>
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text
                  component="div"
                  size="sm"
                  c="var(--ot-muted)"
                  lh={1.6}
                  lineClamp={4}
                  style={{ wordBreak: 'break-word' }}
                >
                  <MarkdownArticle content={item.content} variant="compact" />
                </Text>
                <Group justify="flex-end">
                  <Anchor
                    component={Link}
                    href={`/community/news/${item.id}`}
                    size="xs"
                    c="var(--ot-heading)"
                    underline="hover"
                  >
                    {t('dispatches.readFull')}
                  </Anchor>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      <Space h="xs" />
      <Group justify="center">
        <Anchor
          component={Link}
          href="/community/news"
          size="xs"
          c="var(--ot-muted)"
          underline="hover"
        >
          {t('dispatches.viewAll')}
        </Anchor>
      </Group>
    </GameCard>
  );
};
