import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useState } from 'react';
import { getSession } from 'next-auth/react';

const News = ({ posts: serverPosts }) => {
  const [posts, setPosts] = useState(serverPosts.map(post => ({ ...post })));
  const handleReadChange = async (postId) => {
    // Optimistically update the UI before the API call is made
    setPosts(posts.map(post => {
      if (post.id === postId) {
        return { ...post, isRead: !post.isRead };
      }
      return post;
    }));

    // Determine the new read status based on the current state
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

  return (
    <div className="mainArea pb-10">
      <h2>News</h2>
      {posts.map((post) => (
        <div key={post.id} className="max-w-md mx-auto rounded-xl shadow-md overflow-hidden md:max-w-2xl border border-gray-200">
          {/* Header / Title Bar Section */}
          <div className="bg-gray-600 p-2 flex justify-between items-center">
            <div className="uppercase tracking-wide text-md text-white font-semibold">{post.title}</div>
            <label className="flex items-center space-x-2 text-white text-sm">
              <span>Read:</span>
              <input type="checkbox" checked={post.isRead}
                onChange={() => handleReadChange(post.id)} className="form-checkbox" />
            </label>
          </div>

          {/* Body Section */}
          <div className="p-4">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{post.content}</Markdown>
          </div>
        </div>
      ))}
    </div>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  const userId = session?.user?.id;

  // Fetch posts along with the read status for the current user
  const posts = await prisma.blog_posts.findMany({
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
  });

  // Transform the posts to include a read status boolean
  const postsWithReadStatus = posts.map((post) => {
    const readStatus = post.postReadStatus.length > 0; // If there's any read status, the post is considered read
    
    return {
      ...post,
      isRead: readStatus,
      lastReadAt: readStatus ? post.postReadStatus[0].last_read_at : null,
    };
  });

  return {
    props: { posts: postsWithReadStatus },
  };
};

export default News;
