import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AdminService } from '@/services';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const AccountResetSchema = z.object({
  userId: z.number().int(),
  reason: z.string().optional(),
});

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = req?.session;
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validatedBody = AccountResetSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { userId, reason } = validatedBody.data;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const result = await AdminService.resetAccount(session.user.id, {
      userId,
      reason,
    });
    res
      .status(200)
      .json({ message: result.message, newUserId: result.newUserId });
  } catch (error) {
    logError('Error resetting account:', error);
    res.status(500).json({ error: 'Failed to reset account' });
  }
};

export default withAuth(handler);
