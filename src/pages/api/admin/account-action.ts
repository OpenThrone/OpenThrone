import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSession } from 'next-auth/react';
import { isAdmin } from '@/utils/authorization';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { z } from 'zod';

const AccountActionSchema = z.object({
  userId: z.number().int(),
  action: z.enum(['SUSPENDED', 'BANNED', 'CLOSED', 'ACTIVE']),
  duration: z.number().int().optional(),
  reason: z.string().optional()
});

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getSession({ req });
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parseResult = AccountActionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }
  const { userId, action, duration, reason } = parseResult.data;

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
        admin_id: session.user.id,
      },
    });

    res.status(200).json({ message: `User has been ${action.toLowerCase()}` });
  } catch (error) {
    logError(`Error performing ${action} on user:`, error);
    res.status(500).json({ error: `Failed to perform action ${action}` });
  }
}

export default withAuth(handler);