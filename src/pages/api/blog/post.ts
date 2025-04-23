
import prisma from '@/lib/prisma';
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
    const newPost = await prisma.blog_posts.create({
      data: {
        title,
        content,
        postedby_id: session.user.id,
      },
    });
    res.status(200).json(newPost);
  } catch (error) {
    logError('Error creating new post:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

export default withAuth(handler);