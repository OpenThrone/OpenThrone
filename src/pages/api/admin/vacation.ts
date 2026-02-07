import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const AdminVacationSchema = z.object({
  userId: z.number().int(),
  action: z.enum(['start', 'end']),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: AdminVacationSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof AdminVacationSchema> },
) {
  const sessionUserId = req.session?.user?.id;
  if (!sessionUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, action } = context.body;

  if (action === 'start') {
    // Admin starting vacation for a user
    try {
      const now = new Date();
      const vacationEndDate = new Date();
      vacationEndDate.setDate(now.getDate() + 14); // 2 weeks

      await prisma.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'VACATION',
          start_date: now,
          end_date: vacationEndDate,
          reason: 'Admin initiated vacation mode',
          admin_id: Number(sessionUserId),
        },
      });

      res
        .status(200)
        .json({ message: 'Vacation mode started for user', vacationEndDate });
    } catch (error) {
      logError('Error starting vacation mode for user:', error);
      res.status(500).json({ error: 'Failed to start vacation mode for user' });
    }
  } else if (action === 'end') {
    // Admin ending vacation for a user
    try {
      await prisma.accountStatusHistory.updateMany({
        where: {
          user_id: userId,
          status: 'VACATION',
          end_date: null,
        },
        data: {
          end_date: new Date(),
        },
      });

      // Create a new ACTIVE status entry
      await prisma.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'ACTIVE',
          start_date: new Date(),
          reason: 'Vacation mode ended by admin',
          admin_id: Number(sessionUserId),
        },
      });

      res.status(200).json({ message: 'Vacation mode ended for user' });
    } catch (error) {
      logError('Error ending vacation mode for user:', error);
      res.status(500).json({ error: 'Failed to end vacation mode for user' });
    }
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
}

export default guardedHandler(handler);
