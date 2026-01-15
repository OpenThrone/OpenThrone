import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { BlogService } from '@/services';

const UpdateReadStatusSchema = z.object({
  postId: z.number().int(),
});

const updateReadStatus = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Get the session on the server-side
  const { session } = req;
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const validatedBody = UpdateReadStatusSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { postId } = validatedBody.data;

  try {
    const result = await BlogService.updateReadStatus({
      userId: parseInt(session.user.id.toString()),
      postId,
    });

    if (result.success) {
      res.status(200).json({ message: result.message });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default withAuth(updateReadStatus);
