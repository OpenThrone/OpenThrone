import prisma from "@/lib/prisma";
import { withAuth } from '@/middleware/auth';
import type { NextApiRequest, NextApiResponse } from 'next';

const getPosts = async(req: NextApiRequest, res: NextApiResponse) => {
  // Get the session on the server-side
  const session = req.session;

  // If there's no session, return an error
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

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

    // Fetch posts along with the read status for the current user
    const posts = await prisma.blog_posts.findMany({
      include: {
        postReadStatus: {
          where: {
            user_id: parseInt(user.id.toString()),
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

    res.status(200).json(posts);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getPosts);