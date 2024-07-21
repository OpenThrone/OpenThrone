import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useState } from 'react';
import { getSession } from 'next-auth/react';
import prisma from '@/lib/prisma';
import { Button, Modal, Space, Textarea, TextInput } from '@mantine/core';
import Error from 'next/error';
import { InferGetServerSidePropsType } from "next";
import BlogPost from '@/components/blogPost';

const News = ({ posts: serverPosts, loggedIn, userId }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [posts, setPosts] = useState(serverPosts.map(post => ({ ...post })).sort((a, b) => b.created_timestamp - a.created_timestamp));
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
      console.error('Error updating read status:', error);

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
      console.error('Error creating new post:', error);
    }
  };

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">News</h2>
      {loggedIn && userId === 1 && (
        <Button onClick={() => setModalIsOpen(true)}>
          Post New
        </Button>
      )}
      <Space h='sm' />
      {posts.map((post) => (
        <BlogPost post={post} loggedIn={loggedIn} handleReadChange={handleReadChange} key={'Post_'+post.id} />
      ))}
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
    </div>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  let posts;
  if (session) {
    
    const userId = session?.user?.id;

    // Fetch posts along with the read status for the current user
    posts = await prisma.blog_posts.findMany({
      include: {
        postReadStatus: {
          where: {
            user_id: parseInt(userId.toString()),
          },
          select: {
            last_read_at: true, // Select only the last_read_at field
          },
        },
      },
      orderBy: {
        created_timestamp: 'desc',
      },
    });
    // Transform the posts to include a read status boolean
    const postsWithReadStatus = posts.map((post) => {
      const readStatus = post.postReadStatus.length > 0; // If there's any read status, the post is considered read
      console.log('readStatus: ', readStatus);
      return {
        ...post,
        isRead: readStatus,
        lastReadAt: readStatus ? post.postReadStatus[0].last_read_at : null,
      };
    });
    return {
      props: { posts: postsWithReadStatus, loggedIn: true, userId},
    };
  } 
  // Fetch posts without the read status
  posts = await prisma.blog_posts.findMany();
  
  return {
    props: { posts, loggedIn: false },
  };
};

export default News;
