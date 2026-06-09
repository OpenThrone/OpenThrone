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
import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { GameCard } from './GameCard';

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
  if (news.length === 0) {
    return (
      <GameCard
        title="War Room Intelligence"
        icon={faScroll}
        goldAccent={false}
      >
        <Text size="sm" c="dimmed" ta="center" py="lg">
          No dispatches at this time. The war council is quiet.
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
    <GameCard title="War Room Intelligence" icon={faScroll}>
      <Accordion
        variant="contained"
        defaultValue={
          sorted.find((n) => !n.read)?.id?.toString() ??
          sorted[0]?.id?.toString()
        }
        styles={{
          item: {
            backgroundColor: '#0f141a',
            borderBottom: '1px solid #1f2b3b',
            borderRadius: '4px !important',
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
                      style={{ color: '#e5c55a' }}
                    />
                  )}
                  <Text size="sm" fw={600} c="gray.2" lineClamp={1}>
                    {item.title}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {!item.read && (
                    <Badge size="xs" color="yellow" variant="filled">
                      NEW
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
                  <Text size="xs" c="dimmed">
                    {new Date(item.created_timestamp).toLocaleDateString()}
                  </Text>
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text
                  size="sm"
                  c="gray.4"
                  lh={1.6}
                  lineClamp={4}
                  style={{ wordBreak: 'break-word' }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      p: ({ children }) => <>{children}</>,
                      h1: ({ children }) => <strong>{children}</strong>,
                      h2: ({ children }) => <strong>{children}</strong>,
                    }}
                  >
                    {item.content}
                  </ReactMarkdown>
                </Text>
                <Group justify="flex-end">
                  <Anchor
                    component={Link}
                    href={`/community/news/${item.id}`}
                    size="xs"
                    c="yellow.4"
                    underline="hover"
                  >
                    Read full dispatch →
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
          c="gray.5"
          underline="hover"
        >
          View all dispatches →
        </Anchor>
      </Group>
    </GameCard>
  );
};
