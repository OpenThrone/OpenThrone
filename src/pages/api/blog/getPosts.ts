import prisma from "@/lib/prisma";
import { withAuth } from '@/middleware/auth';
import type { NextApiRequest, NextApiResponse } from 'next';

const getPosts = async(req: NextApiRequest, res: NextApiResponse) => {
  // Get the session on the server-side
  const session = req.session;

  try {
    // Fetch the user based on the session's user ID
    const user = await prisma.users.findUnique({
      where: {
        id: typeof (session.user.id) === 'string' ? parseInt(session.user.id) : session.user.id,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Calculate the date 2 weeks ago
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const posts = await prisma.blog_posts.findMany({
      where: {created_timestamp: {gte: twoWeeksAgo}
      },
      orderBy: {
        created_timestamp: 'desc'
      },      
    });

    // Count the posts
    const count = posts.length;

    const latestRead = await prisma.post_read_status.count({
      where: {
        user_id: user.id,
        post_id: posts[0].id
      },
    })

    if (latestRead > 0) {
      res.status(200).json({ error: 'No recent unread posts found' });
    }
    if (posts.length === 0) {
      res.status(200).json({ error: 'No posts found' });
    }
    
    res.status(200).json(posts[0]);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getPosts);