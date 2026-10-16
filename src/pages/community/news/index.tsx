import { Box, Button, Text, Title } from '@mantine/core';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { getSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import BlogPost from '@/components/blogPost';
import MainArea from '@/components/MainArea';
import type { NewsDraft } from '@/components/news/NewsComposer';
import NewsComposer from '@/components/news/NewsComposer';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import type { BlogPostDTO } from '@/services/Blog.service';
import { BlogService } from '@/services/Blog.service';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

const News = ({
  posts: serverPosts,
  loggedIn,
  userId = 0,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('community');
  const [posts, setPosts] = useState(() =>
    serverPosts.map((post) => ({ ...post })),
  );
  const [composerIsOpen, setComposerIsOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const canPost = loggedIn && userId === 1;
  const [draft, setDraft] = useState<NewsDraft>({ title: '', content: '' });

  const handleReadChange = async (postId: number) => {
    if (!loggedIn) return;
    const postToUpdate = posts.find((p) => p.id === postId);
    if (!postToUpdate) return;
    const newReadStatus = !postToUpdate.isRead;

    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, isRead: newReadStatus } : p)),
    );

    try {
      const response = await fetch('/api/blog/updateReadStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, isRead: newReadStatus }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      await response.json();
    } catch (error) {
      logError('Error updating read status:', error);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isRead: !newReadStatus } : p,
        ),
      );
    }
  };

  const handlePostNew = async () => {
    if (!canPost || isPosting) return;
    if (!draft.title.trim() || !draft.content.trim()) return;
    setIsPosting(true);
    setPostError('');
    try {
      const response = await fetch('/api/blog/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: draft.title.trim(),
          content: draft.content.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setPosts((prev) => [{ ...data, isRead: false }, ...prev]);
      setDraft({ title: '', content: '' });
      setComposerIsOpen(false);
    } catch (error) {
      logError('Error creating new post:', error);
      setPostError(t('news.saveError'));
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <>
      <SeoHead title={t('news.title')} description={t('news.description')} />
      <MainArea title={t('news.title')}>
        <Box className={classes.page}>
          <PublicHero
            title={t('news.realmDispatches')}
            description={t('news.officialProclamations')}
          />
          <Box className={classes.newsToolbar}>
            <Text className={classes.prose}>{t('news.description')}</Text>
            {canPost && !composerIsOpen && (
              <Button onClick={() => setComposerIsOpen(true)}>
                {t('news.postNew')}
              </Button>
            )}
          </Box>

          {canPost && composerIsOpen && (
            <NewsComposer
              draft={draft}
              onDraftChange={setDraft}
              isSubmitting={isPosting}
              error={postError}
              onSubmit={handlePostNew}
              onClose={() => setComposerIsOpen(false)}
            />
          )}

          <Box className={classes.newsFeed}>
            {posts.length === 0 ? (
              <Box className={classes.emptyNews}>
                <Title order={2} className={classes.sectionTitle}>
                  {t('news.noNewsYet')}
                </Title>
                {canPost && (
                  <Button onClick={() => setComposerIsOpen(true)}>
                    {t('news.createFirstPost')}
                  </Button>
                )}
              </Box>
            ) : (
              [...posts]
                .sort((a, b) => {
                  if (a.isPinned && !b.isPinned) return -1;
                  if (!a.isPinned && b.isPinned) return 1;
                  return 0;
                })
                .map((post) => (
                  <BlogPost
                    post={post}
                    loggedIn={loggedIn}
                    handleReadChange={handleReadChange}
                    key={`Post_${post.id}`}
                  />
                ))
            )}
          </Box>
        </Box>
      </MainArea>
    </>
  );
};

type NewsPageProps = {
  posts: BlogPostDTO[];
  loggedIn: boolean;
  userId: number;
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps<NewsPageProps> = async (
  context,
) => {
  const session = await getSession(context);
  const i18nPromise = serverSideTranslations(context.locale ?? 'en', [
    'common',
    'navigation',
    'community',
  ]);
  try {
    if (session) {
      const userId =
        typeof session.user.id === 'string'
          ? parseInt(session.user.id)
          : session.user.id;
      const [result, i18nProps] = await Promise.all([
        BlogService.getPosts(userId, { status: 'PUBLISHED' }),
        i18nPromise,
      ]);
      return {
        props: {
          posts: result.posts,
          loggedIn: true,
          userId,
          ...i18nProps,
        },
      };
    }

    const [result, i18nProps] = await Promise.all([
      BlogService.getPosts(undefined, { status: 'PUBLISHED' }),
      i18nPromise,
    ]);
    return {
      props: {
        posts: result.posts,
        loggedIn: false,
        userId: 0,
        ...i18nProps,
      },
    };
  } catch (error) {
    logError('Error fetching posts for server-side props', error);
    return {
      props: {
        posts: [],
        loggedIn: false,
        userId: 0,
        ...(await i18nPromise),
      },
    };
  }
};

export default News;
