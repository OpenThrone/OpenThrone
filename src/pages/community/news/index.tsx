import { faScroll } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Space,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { getSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useState } from 'react';

import BlogPost from '@/components/blogPost';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import SeoHead from '@/components/SeoHead';
import type { BlogPostDTO } from '@/services/Blog.service';
import { BlogService } from '@/services/Blog.service';
import { logError } from '@/utils/logger';

const News = ({
  posts: serverPosts,
  loggedIn,
  userId = 0,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('community');
  const [posts, setPosts] = useState(() =>
    serverPosts.map((post) => ({ ...post })),
  );
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '' });

  const handleReadChange = async (postId: number) => {
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
    try {
      const response = await fetch('/api/blog/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPost),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setPosts([...posts, data]);
      setModalIsOpen(false);
      setNewPost({ title: '', content: '' });
    } catch (error) {
      logError('Error creating new post:', error);
    }
  };

  return (
    <>
      <SeoHead
        title={t('news.title')}
        description="Stay current on realm updates, balance patches, and seasonal campaigns. Read the latest dispatches from the OpenThrone war council."
      />
      <MainArea title={t('news.title')}>
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <div className="public-rise">
              <GameCard
                title={t('news.realmDispatches')}
                icon={faScroll}
                action={
                  loggedIn && userId === 1 ? (
                    <Button
                      size="xs"
                      color="yellow"
                      onClick={() => setModalIsOpen(true)}
                    >
                      {t('news.postNew')}
                    </Button>
                  ) : null
                }
              >
                <Text size="sm" c="gray.3" lh={1.7}>
                  {t('news.officialProclamations')}
                </Text>
                <Group mt="md" gap="xs">
                  <Text
                    size="xs"
                    c="dimmed"
                    tt="uppercase"
                    fw={700}
                    style={{ letterSpacing: '0.3em' }}
                  >
                    {t('news.readStatus')}
                  </Text>
                  <Text size="xs" c="gray.5">
                    {t('news.readStatusSaved')}
                  </Text>
                </Group>
              </GameCard>
            </div>

            <div className="public-rise public-rise-delay-1">
              <GameCard
                title={t('news.warCouncilNotes')}
                icon={faScroll}
                goldAccent={false}
              >
                <Text size="sm" c="gray.3" lh={1.7}>
                  {t('news.followOngoingStoryArc')}
                </Text>
                <Box mt="md">
                  <Text
                    size="xs"
                    c="dimmed"
                    tt="uppercase"
                    fw={700}
                    style={{ letterSpacing: '0.3em' }}
                  >
                    {t('news.proTip')}
                  </Text>
                  <Text size="sm" c="gray.4">
                    {t('news.subscribeDiscord')}
                  </Text>
                </Box>
              </GameCard>
            </div>
          </SimpleGrid>

          <SimpleGrid cols={1} spacing="lg" mt="xl">
            <Space h="lg" />

            {posts.length === 0 ? (
              <GameCard
                title={t('news.noNewsYet')}
                icon={faScroll}
                goldAccent={false}
              >
                <Text size="sm" c="gray.3">
                  {t('news.noNewsYet')}
                </Text>
                <Group mt="md">
                  <Button onClick={() => setModalIsOpen(true)}>
                    {t('news.createFirstPost')}
                  </Button>
                </Group>
              </GameCard>
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
          </SimpleGrid>

          <Modal
            opened={modalIsOpen}
            onClose={() => setModalIsOpen(false)}
            title={t('news.title')}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePostNew();
              }}
            >
              <TextInput
                label={t('news.fieldTitle')}
                value={newPost.title}
                onChange={(e) =>
                  setNewPost({ ...newPost, title: e.target.value })
                }
                required
              />
              <Textarea
                label={t('news.content')}
                value={newPost.content}
                onChange={(e) =>
                  setNewPost({ ...newPost, content: e.target.value })
                }
                required
              />
              <Button type="submit" className="mt-4">
                {t('news.submit')}
              </Button>
              <Button
                type="button"
                className="mt-2"
                variant="outline"
                onClick={() => setModalIsOpen(false)}
              >
                {t('news.cancel')}
              </Button>
            </form>
          </Modal>
        </div>
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
        BlogService.getPosts(userId),
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
      BlogService.getPosts(),
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
