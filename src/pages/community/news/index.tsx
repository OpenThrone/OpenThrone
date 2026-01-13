import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { getSafeLocale } from '@/utils/i18n';

import { Box, Button, Group, Modal, SimpleGrid, Space, Text, Textarea, TextInput } from '@mantine/core';
import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { getSession } from 'next-auth/react';

import BlogPost from '@/components/blogPost';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { BlogService } from '@/services/Blog.service';
import { logError } from '@/utils/logger';
import { InferGetServerSidePropsType } from 'next';

const News = ({ posts: serverPosts, loggedIn, userId = 0 }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('community');
  const [posts, setPosts] = useState(serverPosts.map(post => ({ ...post })));
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '' });

  const handleReadChange = async (postId) => {
    setPosts(posts.map(post => {
      if (post.id === postId) {
        return { ...post, isRead: !post.isRead };
      }
      return post;
    }));

    const postToUpdate = posts.find(post => post.id === postId);
    const newReadStatus = postToUpdate ? !postToUpdate.isRead : false;

    try {
      const response = await fetch('/api/blog/updateReadStatus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, isRead: newReadStatus }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      await response.json();
    } catch (error) {
      logError('Error updating read status:', error);

      // Revert UI in case of error
      setPosts(posts.map(post => {
        if (post.id === postId) {
          return { ...post, isRead: !post.isRead }; // Revert isRead status
        }
        return post;
      }));
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
    <MainArea title={t('news.title')}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div className="public-rise">
            <GameCard
              title={t('news.realmDispatches')}
              icon={faScroll}
              action={loggedIn && userId === 1 ? (
                <Button size="xs" color="yellow" onClick={() => setModalIsOpen(true)}>
                  {t('news.postNew')}
                </Button>
              ) : null}
            >
              <Text size="sm" c="gray.3" lh={1.7}>
                {t('news.officialProclamations')}
              </Text>
              <Group mt="md" gap="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
                  {t('news.readStatus')}
                </Text>
                <Text size="xs" c="gray.5">
                  {t('news.readStatusSaved')}
                </Text>
              </Group>
            </GameCard>
          </div>

          <div className="public-rise public-rise-delay-1">
            <GameCard title={t('news.warCouncilNotes')} icon={faScroll} goldAccent={false}>
              <Text size="sm" c="gray.3" lh={1.7}>
                {t('news.followOngoingStoryArc')}
              </Text>
              <Box mt="md">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
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
            <GameCard title={t('news.noNewsYet')} icon={faScroll} goldAccent={false}>
              <Text size="sm" c="gray.3">
                {t('news.noNewsYet')}
              </Text>
              <Group mt="md">
                <Button onClick={() => setModalIsOpen(true)}>{t('news.createFirstPost')}</Button>
              </Group>
            </GameCard>
          ) : (
            posts.map((post) => (
              <BlogPost post={post} loggedIn={loggedIn} handleReadChange={handleReadChange} key={`Post_${post.id}`} />
            ))
          )}
        </SimpleGrid>

        <Modal
          opened={modalIsOpen}
          onClose={() => setModalIsOpen(false)}
          title={t('news.title')}
        >
          <form onSubmit={(e) => { e.preventDefault(); handlePostNew(); }}>
            <TextInput
              label={t('news.fieldTitle')}
              value={newPost.title}
              onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              required
            />
            <Textarea
              label={t('news.content')}
              value={newPost.content}
              onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
              required
            />
            <Button type="submit" className="mt-4">{t('news.submit')}</Button>
            <Button type="button" className="mt-2" variant="outline" onClick={() => setModalIsOpen(false)}>{t('news.cancel')}</Button>
          </form>
        </Modal>
      </div>
    </MainArea>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  try {
    if (session) {
      const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id;
      const result = await BlogService.getPosts(userId);
      return { props: { posts: result.posts, loggedIn: true, userId, ...(await serverSideTranslations(getSafeLocale(context), ['community'])) } };
    }

    const result = await BlogService.getPosts();
    return { props: { posts: result.posts, loggedIn: false, userId: 0, ...(await serverSideTranslations(getSafeLocale(context), ['community'])) } };
  } catch (error) {
    logError('Error fetching posts for server-side props', error);
    return { props: { posts: [], loggedIn: false, userId: 0, ...(await serverSideTranslations(getSafeLocale(context), ['community'])) } };
  }
};

export default News;
