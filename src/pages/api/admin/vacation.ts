import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSession } from 'next-auth/react';
import { isAdmin } from '@/utils/authorization';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, action } = req.body;

  if (!userId || !action) {
    return res.status(400).json({ error: 'Missing userId or action' });
  }

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
          admin_id: session.user.id,
        },
      });

      res.status(200).json({ message: 'Vacation mode started for user', vacationEndDate });
    } catch (error) {
      console.error('Error starting vacation mode for user:', error);
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
          admin_id: session.user.id,
        },
      });

      res.status(200).json({ message: 'Vacation mode ended for user' });
    } catch (error) {
      console.error('Error ending vacation mode for user:', error);
      res.status(500).json({ error: 'Failed to end vacation mode for user' });
    }
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
}
