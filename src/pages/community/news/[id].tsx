import prisma from "@/lib/prisma";
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useState } from 'react';
import { getSession } from 'next-auth/react';
import { InferGetServerSidePropsType } from "next";
import { Flex } from "@mantine/core";
import BlogPost from "@/components/blogPost";

const News = ({ post: serverPost, loggedIn }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [post, setPost] = useState({ ...serverPost });
  const handleReadChange = async () => {
    // Optimistically update the UI before the API call is made
    setPost({ ...post, isRead: !post.isRead });

    // Determine the new read status based on the current state
    const newReadStatus = !post.isRead;

    try {
      const response = await fetch('/api/blog/updateReadStatus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId: post.id, isRead: newReadStatus }),
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
      setPost({ ...post, isRead: !post.isRead }); // Revert the isRead status
    }
  };

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">News</h2>
        <BlogPost post={post} loggedIn={loggedIn} handleReadChange={handleReadChange} />
    </div>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);

  if (session) {
    console.log('context.params.id: ', context.params.id);

    const userId = parseInt(session.user.id.toString());
    const postId = parseInt(context.params.id); // Make sure to convert the id to the correct type

    // Fetch the post along with the read status for the current user
    const post = await prisma.blog_posts.findUnique({
      where: {
        id: postId, // Use the converted postId
      },
      include: {
        postReadStatus: {
          where: {
            user_id: userId,
          },
          select: {
            last_read_at: true, // Select only the last_read_at field
          },
        },
      },
    });

    // Check if the post was found
    if (!post) {
      return {
        notFound: true,
      };
    }

    // Transform the post to include a read status boolean
    const isRead = post.postReadStatus.length > 0; // If there's any read status, the post is considered read
    const postWithReadStatus = {
      ...post,
      isRead: isRead,
      lastReadAt: isRead ? post.postReadStatus[0].last_read_at : null,
    };

    return {
      props: { post: postWithReadStatus, loggedIn: true },
    };
  }

  // If not logged in or no session, you might redirect or show a generic message
  // Redirecting as an example
  return {
    redirect: {
      destination: '/login',
      permanent: false,
    },
  };
};


export default News;
