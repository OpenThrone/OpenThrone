import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const AccountActionSchema = z.object({
  userId: z.number().int(),
  action: z.enum(['SUSPENDED', 'BANNED', 'CLOSED', 'ACTIVE']),
  duration: z.number().int().optional(),
  reason: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: AccountActionSchema,
});

export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof AccountActionSchema> },
) => {
  const { userId, action, duration, reason } = context.body;
  const sessionUserId = req.session?.user?.id;

  if (!sessionUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    let endDate = null;

    if (duration && action !== 'CLOSED') {
      endDate = new Date();
      endDate.setDate(now.getDate() + duration);
    }

    // End current statuses if necessary
    await prisma.accountStatusHistory.updateMany({
      where: {
        user_id: userId,
        end_date: null,
      },
      data: {
        end_date: now,
      },
    });

    // Create new status entry
    await prisma.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: action,
        start_date: now,
        end_date: endDate,
        reason: reason || `${action} by admin`,
        admin_id: Number(sessionUserId),
      },
    });

    res.status(200).json({ message: `User has been ${action.toLowerCase()}` });
  } catch (error) {
    logError(`Error performing ${action} on user:`, error);
    res.status(500).json({ error: `Failed to perform action ${action}` });
  }
};

export default guardedHandler(handler);
