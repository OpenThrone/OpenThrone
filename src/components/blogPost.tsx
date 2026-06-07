/* eslint-disable @next/next/no-img-element */
import { faScroll } from '@fortawesome/free-solid-svg-icons';
import {
  ActionIcon,
  Badge,
  Divider,
  Group,
  Space,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import React, { useCallback, useMemo } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { GameCard } from './game/GameCard';

/** @param {string|number|Date} ts */
const formatDate = (ts: any) => {
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
};

/** @param {string} markdown */
const estimateReadTime = (markdown = '') => {
  const words = markdown
    .replace(/<[^>]*>/g, '')
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
};

type BlogPostProps = {
  post: any;
  loggedIn: boolean;
  handleReadChange: (id: number) => void;
};

const BlogPost = ({ post, loggedIn, handleReadChange }: BlogPostProps) => {
  const readTime = useMemo(
    () => estimateReadTime(post?.content ?? ''),
    [post?.content],
  );

  const onShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.title, url });
        return;
      }
      if (navigator.clipboard && url) await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }, [post?.title]);

  return (
    <>
      <div key={post.id} className="mx-auto w-full px-4">
        <GameCard
          title={post.title}
          icon={faScroll}
          goldAccent
          action={
            <div className="flex flex-col items-end gap-1">
              <Group gap={6} wrap="nowrap">
                {post.kind && (
                  <Badge
                    size="xs"
                    variant="light"
                    color={
                      post.kind === 'NEWS'
                        ? 'yellow'
                        : post.kind === 'CHANGELOG'
                          ? 'green'
                          : 'blue'
                    }
                  >
                    {post.kind}
                  </Badge>
                )}
                {post.isPinned && (
                  <Badge size="xs" variant="filled" color="yellow">
                    PINNED
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" className="opacity-70">
                {post.authorName
                  ? `${post.authorName} • `
                  : ''}
                {formatDate(post.created_timestamp)} • {readTime}
              </Text>

              <Group gap={8} wrap="nowrap">
                {loggedIn && (
                  <Switch
                    size="xs"
                    checked={Boolean(post.isRead)}
                    onChange={() => handleReadChange(post.id)}
                    onLabel="READ"
                    offLabel="NEW"
                    styles={{
                      track: { border: '1px solid rgba(255,255,255,0.12)' },
                      thumb: { boxShadow: 'none' },
                    }}
                  />
                )}

                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={onShare}
                  aria-label="Share post"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M16 6l-4-4-4 4M12 2v14"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ActionIcon>
              </Group>
            </div>
          }
        >
          <Stack gap="md">
            {post.image && (
              <img
                src={post.image}
                alt={post.title ?? 'hero image'}
                className="h-64 w-full rounded-lg object-cover"
              />
            )}

            <Divider opacity={0.25} />

            <div className="prose prose-invert max-w-none">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  h1: ({ ...props }) => <Title order={2} {...props} />,
                  h2: ({ ...props }) => <Title order={3} {...props} />,
                  h3: ({ ...props }) => <Title order={4} {...props} />,
                  p: ({ ...props }) => (
                    <Text component="p" size="md" lh={1.7} className="my-2">
                      {props.children}
                    </Text>
                  ),
                  a: ({ ...props }) => (
                    <a
                      {...props}
                      className="text-yellow-300 underline-offset-4 hover:underline"
                    />
                  ),
                  img: ({ ...props }) => (
                    <img
                      {...props}
                      className="h-auto w-full rounded-lg"
                      alt={props.alt ?? ''}
                    />
                  ),
                  blockquote: ({ ...props }) => (
                    <blockquote className="border-l-2 border-yellow-300/40 pl-4 opacity-95">
                      {props.children}
                    </blockquote>
                  ),
                }}
              >
                {post.content}
              </Markdown>
            </div>

            {post.tags?.length ? (
              <Group gap={8}>
                {post.tags.map((t: string) => (
                  <Badge
                    key={t}
                    variant="light"
                    radius="sm"
                    className="border border-white/10 bg-[#0f1720] text-yellow-200"
                  >
                    {t}
                  </Badge>
                ))}
              </Group>
            ) : null}
          </Stack>
        </GameCard>
      </div>

      <Space h="lg" />
    </>
  );
};

export default BlogPost;
