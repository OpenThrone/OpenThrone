import md5 from 'md5';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { BlogService } from '@/services';
import { logError } from '@/utils/logger';

const PostSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { session } = req;

  if (!session || session.user.id !== 1) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const validatedBody = PostSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      message: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { title, content } = validatedBody.data;

  try {
    const result = await BlogService.createPost({
      userId: session.user.id,
      title,
      content,
    });

    if (result.success) {
      const post = result.data;
      const message = `New blog post: ${post?.title || 'Untitled'}`;
      const hash = md5(message + post?.id);
      getSocketIO()?.emit('blogPostNotification', {
        message,
        hash,
        postId: post?.id,
        title: post?.title,
      });
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
