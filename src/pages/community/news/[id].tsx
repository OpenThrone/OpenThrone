import { getSession } from 'next-auth/react';
import { InferGetServerSidePropsType } from 'next';
import { useState } from 'react';
import BlogPost from '@/components/blogPost';
import MainArea from '@/components/MainArea';
import { BlogService } from '@/services';

const News = ({ post: serverPost, loggedIn }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [post, setPost] = useState({ ...serverPost });

  const handleReadChange = async () => {
    setPost({ ...post, isRead: !post.isRead });
    const newReadStatus = !post.isRead;
    try {
      const response = await fetch('/api/blog/updateReadStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, isRead: newReadStatus }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
    } catch (err) {
      // revert on error
      setPost({ ...post, isRead: !post.isRead });
    }
  };

  return (
    <MainArea title="News">
      <BlogPost post={post} loggedIn={loggedIn} handleReadChange={handleReadChange} />
    </MainArea>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);

  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id;
  const postId = parseInt(context.params.id as string);

  try {
    const result = await BlogService.getPost(postId, userId);
    if (!result.post) return { notFound: true };
    return { props: { post: result.post, loggedIn: true } };
  } catch (error) {
    console.error('Error fetching post:', error);
    return { notFound: true };
  }
};

export default News;
