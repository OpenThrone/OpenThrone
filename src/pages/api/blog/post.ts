
import { BlogService } from '@/services';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import type { NextApiRequest, NextApiResponse } from 'next';

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = req.session;

  if (!session || session.user.id !== 1) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { title, content } = req.body;

  try {
    const result = await BlogService.createPost({
      userId: session.user.id,
      title,
      content,
    });

    if (result.success) {
      res.status(200).json(result.data);
    } else {
      res.status(400).json({ message: result.message });
    }
  } catch (error) {
    logError('Error creating new post:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

export default withAuth(handler);