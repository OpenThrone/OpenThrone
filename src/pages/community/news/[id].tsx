import { Box, Button, Group } from '@mantine/core';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import BlogPost from '@/components/blogPost';
import MainArea from '@/components/MainArea';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import type { BlogPostDTO } from '@/services/Blog.service';
import { BlogService } from '@/services/Blog.service';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

const News = ({
  post: serverPost,
  loggedIn,
}: {
  post: BlogPostDTO;
  loggedIn: boolean;
}) => {
  const { t } = useTranslation('community');
  const [post, setPost] = useState<BlogPostDTO>(() => ({
    ...serverPost,
    isRead: serverPost.isRead,
  }));

  const handleReadChange = async () => {
    if (!loggedIn) return;
    const newReadStatus = !post.isRead;
    setPost((prev) => ({ ...prev, isRead: newReadStatus }));
    try {
      const response = await fetch('/api/blog/updateReadStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, isRead: newReadStatus }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
    } catch {
      // revert on error
      setPost((prev) => ({ ...prev, isRead: !newReadStatus }));
    }
  };

  return (
    <>
      <SeoHead title={post.title} description={t('news.description')} />
      <MainArea title={t('news.title')}>
        <Box className={classes.page}>
          <Group mb="xl">
            <Button
              component={Link}
              href="/community/news"
              variant="outline"
              color="gray"
              size="xs"
            >
              {t('news.backToNews')}
            </Button>
          </Group>
          <BlogPost
            post={post}
            loggedIn={loggedIn}
            handleReadChange={handleReadChange}
          />
        </Box>
      </MainArea>
    </>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps<{
  post: BlogPostDTO;
  loggedIn: boolean;
}> = async (context) => {
  const session = await getSession(context);
  const userId = session
    ? typeof session.user.id === 'string'
      ? parseInt(session.user.id)
      : session.user.id
    : undefined;
  const postId = Number(context.params?.id);
  if (!Number.isSafeInteger(postId) || postId <= 0) return { notFound: true };

  try {
    const result = await BlogService.getPost(postId, userId);
    if (!result.post) return { notFound: true };
    return {
      props: {
        post: result.post,
        loggedIn: Boolean(session),
        ...(await serverSideTranslations(context.locale ?? 'en', [
          'common',
          'navigation',
          'community',
        ])),
      },
    };
  } catch (error) {
    logError('Error fetching post:', error);
    return { notFound: true };
  }
};

export default News;
