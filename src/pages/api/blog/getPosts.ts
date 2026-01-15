import type { NextApiRequest, NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { BlogService } from '@/services';

const getPosts = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get the session on the server-side
  const { session } = req;

  try {
    const userId =
      typeof session.user.id === 'string'
        ? parseInt(session.user.id)
        : session.user.id;

    const result = await BlogService.getLatestUnreadPost(userId);

    if (result.success) {
      res.status(200).json(result.data);
    } else {
      res.status(200).json({ error: result.message });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(getPosts);
