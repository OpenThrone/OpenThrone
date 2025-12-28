import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useState } from 'react';
import { getSession } from 'next-auth/react';
import { BlogService } from '@/services/Blog.service';
import { Button, Modal, Space, Textarea, TextInput } from '@mantine/core';
import ContentCard from '@/components/ContentCard';
import { logError } from '@/utils/logger';
import { InferGetServerSidePropsType } from "next";
import BlogPost from '@/components/blogPost';
import MainArea from '@/components/MainArea';

const News = ({ posts: serverPosts, loggedIn, userId = 0 }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [posts, setPosts] = useState(serverPosts.map(post => ({ ...post })).sort((a, b) => new Date(b.created_timestamp).getTime() - new Date(a.created_timestamp).getTime()));
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '' });
  console.log('serverPosts: ', serverPosts);

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
      const data = await response.json();
      console.log('Success:', data);
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
      {loggedIn && userId === 1 && (
        <Button onClick={() => setModalIsOpen(true)}>
          Post New
        </Button>
      )}
      <Space h='sm' />
      {posts.length === 0 ? (
        <ContentCard title="No News" variant="secondary" titleSize="md">
          <p className="text-gray-400">There are no news posts yet. Check back later or post a new announcement.</p>
          {loggedIn && userId === 1 && (
            <div className="mt-3">
              <Button onClick={() => setModalIsOpen(true)}>Create first post</Button>
            </div>
          )}
        </ContentCard>
      ) : (
        posts.map((post) => (
          <BlogPost post={post} loggedIn={loggedIn} handleReadChange={handleReadChange} key={'Post_'+post.id} />
        ))
      )}
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
