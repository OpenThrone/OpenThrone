import { useState } from 'react';
import type { InferGetServerSidePropsType } from 'next';

import { Box, Button, Group, Modal, SimpleGrid, Space, Text, Textarea, TextInput } from '@mantine/core';
import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { getSession } from 'next-auth/react';

import BlogPost from '@/components/blogPost';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { BlogService } from '@/services/Blog.service';
import { logError } from '@/utils/logger';

const News = ({ posts: serverPosts, loggedIn, userId = 0 }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [posts, setPosts] = useState(serverPosts.map(post => ({ ...post })).sort((a, b) => new Date(b.created_timestamp).getTime() - new Date(a.created_timestamp).getTime()));
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

      // Optionally, handle the response data if needed
      await response.json();
    } catch (error) {
      logError('Error updating read status:', error);

      // Revert the UI in case of error
      setPosts(posts.map(post => {
        if (post.id === postId) {
          return { ...post, isRead: !post.isRead }; // Revert the isRead status
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
    <MainArea title="News">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div className="public-rise">
            <GameCard
              title="Realm Dispatches"
              icon={faScroll}
              action={loggedIn && userId === 1 ? (
                <Button size="xs" color="yellow" onClick={() => setModalIsOpen(true)}>
                  Post New
                </Button>
              ) : null}
            >
              <Text size="sm" c="gray.3" lh={1.7}>
                Official proclamations, balance updates, and seasonal events are archived here for every commander.
              </Text>
              <Group mt="md" gap="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
                  Public Ledger
                </Text>
                <Text size="xs" c="gray.5">
                  Read status is saved for logged-in commanders.
                </Text>
              </Group>
            </GameCard>
          </div>

          <div className="public-rise public-rise-delay-1">
            <GameCard title="War Council Notes" icon={faScroll} goldAccent={false}>
              <Text size="sm" c="gray.3" lh={1.7}>
                Follow the ongoing story arc, development notes, and campaign arcs as they drop.
              </Text>
              <Box mt="md">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
                  Pro Tip
                </Text>
                <Text size="sm" c="gray.4">
                  Subscribe on Discord for faster alerts between updates.
                </Text>
              </Box>
            </GameCard>
          </div>
        </SimpleGrid>

        <Space h="lg" />

        {posts.length === 0 ? (
          <GameCard title="No News Yet" icon={faScroll} goldAccent={false}>
            <Text size="sm" c="gray.3">
              There are no news posts yet. Check back later or post a new announcement.
            </Text>
            {loggedIn && userId === 1 && (
              <Group mt="md">
                <Button onClick={() => setModalIsOpen(true)}>Create first post</Button>
              </Group>
            )}
          </GameCard>
        ) : (
          posts.map((post) => (
            <BlogPost post={post} loggedIn={loggedIn} handleReadChange={handleReadChange} key={`Post_${post.id}`} />
          ))
        )}
      </div>

      <Modal
        opened={modalIsOpen}
        onClose={() => setModalIsOpen(false)}
        title="New Post"
      >
        <form onSubmit={(e) => { e.preventDefault(); handlePostNew(); }}>
          <TextInput
            label="Title"
            value={newPost.title}
            onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
            required
          />
          <Textarea
            label="Content"
            value={newPost.content}
            onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
            required
          />
          <Button type="submit" className="mt-4">Submit</Button>
          <Button type="button" className="mt-2" variant="outline" onClick={() => setModalIsOpen(false)}>Cancel</Button>
        </form>
      </Modal>
    </MainArea>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  try {
    if (session) {
      const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id;
      const result = await BlogService.getPosts(userId);
      return { props: { posts: result.posts, loggedIn: true, userId } };
    }

    const result = await BlogService.getPosts();
    return { props: { posts: result.posts, loggedIn: false } };
  } catch (error) {
    logError('Error fetching posts for server-side props', error);
    return { props: { posts: [], loggedIn: false } };
  }
};

export default News;
