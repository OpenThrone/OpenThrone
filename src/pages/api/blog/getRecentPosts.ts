import { BlogService } from '@/services';
import { withAuth } from '@/middleware/auth';
import type { NextApiRequest, NextApiResponse } from 'next';

const getRecentPostsAPI = async(req: NextApiRequest, res: NextApiResponse) => {
  // Get the session on the server-side
  const session = req?.session;

  try {
    let userId: number | undefined;
    if (session?.user) {
      userId = typeof (session.user.id) === 'string' ? parseInt(session.user.id) : session.user.id;
    }

    const result = await BlogService.getRecentPosts(userId);
    // result.posts are DTOs (serializable) from the service
    res.status(200).json(result.posts);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getRecentPostsAPI, true);
