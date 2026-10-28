/* eslint-disable @next/next/no-img-element */
import { faShareNodes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo } from 'react';

import frameClasses from '@/components/game/FantasyFrame.module.css';
import MarkdownArticle from '@/components/news/MarkdownArticle';
import classes from '@/components/public/PublicPages.module.css';
import type { BlogPostDTO } from '@/services/Blog.service';
import { getNewsDate } from '@/utils/news';

interface BlogPostProps {
  post: BlogPostDTO & { image?: string; tags?: string[] };
  loggedIn: boolean;
  handleReadChange: (id: number) => void;
}

const BlogPost = ({ post, loggedIn, handleReadChange }: BlogPostProps) => {
  const { t, i18n } = useTranslation('community');
  const { locale, defaultLocale } = useRouter();
  const readMinutes = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(
          post.content
            .replace(/<[^>]*>/g, '')
            .split(/\s+/)
            .filter(Boolean).length / 200,
        ),
      ),
    [post.content],
  );
  const publishedDate = getNewsDate(post);
  const date = new Date(publishedDate);
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        timeZone: 'UTC',
      }).format(date);

  const onShare = useCallback(async () => {
    const localePrefix = locale && locale !== defaultLocale ? `/${locale}` : '';
    const url = new URL(
      `${localePrefix}/community/news/${post.id}`,
      window.location.origin,
    ).href;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Dismissing the share sheet needs no error message.
    }
  }, [post.id, post.title, locale, defaultLocale]);

  return (
    <Paper
      component="article"
      className={`${classes.newsArticle} ${frameClasses.surface} ${frameClasses.ornate}`}
    >
      <Box className={classes.newsHeader}>
        <Title order={2} className={classes.sectionTitle}>
          {post.title}
        </Title>
        <Stack gap="xs">
          <Group gap="xs">
            {post.kind && <Badge variant="light">{post.kind}</Badge>}
            {post.isPinned && (
              <Badge variant="outline">{t('news.pinned')}</Badge>
            )}
          </Group>
          <Text size="xs" c="var(--ot-muted)">
            {post.authorName ? `${post.authorName} · ` : ''}
            {dateLabel && <time dateTime={publishedDate}>{dateLabel}</time>}
            {' · '}
            {t('news.minutesToRead', { count: readMinutes })}
          </Text>
          <Group gap="md">
            {loggedIn && (
              <Switch
                size="sm"
                checked={post.isRead}
                onChange={() => handleReadChange(post.id)}
                label={t(post.isRead ? 'news.markAsUnread' : 'news.markAsRead')}
              />
            )}
            <ActionIcon
              variant="outline"
              size="lg"
              onClick={onShare}
              aria-label={t('news.sharePost')}
            >
              <FontAwesomeIcon icon={faShareNodes} />
            </ActionIcon>
          </Group>
        </Stack>
      </Box>
      <Stack gap="lg">
        {post.image && (
          <img src={post.image} alt="" className="h-64 w-full object-cover" />
        )}
        <MarkdownArticle content={post.content} />
        {post.tags?.length ? (
          <Group gap="xs">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="light" radius="sm">
                {tag}
              </Badge>
            ))}
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
};

export default BlogPost;
