import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSession } from 'next-auth/react';
import { isAdmin } from '@/utils/authorization';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getSession({ req });
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, action, duration, reason } = req.body;

  if (!userId || !action) {
    return res.status(400).json({ error: 'Missing userId or action' });
  }

  const validActions = ['SUSPENDED', 'BANNED', 'CLOSED', 'ACTIVE'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
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