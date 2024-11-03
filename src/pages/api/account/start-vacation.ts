import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSession } from 'next-auth/react';
import { getUpdatedStatus } from '@/utils/utilities';
import { withAuth } from '@/middleware/auth';

export const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const session = req.session;
    if (!session || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1); // Jan 1st of current year

    try {
      // Count the number of vacations started this year
      const vacationCount = await prisma.accountStatusHistory.count({
        where: {
          user_id: userId,
          status: 'VACATION',
          start_date: {
            gte: yearStart,
          },
        },
      });

      if (vacationCount >= 4) {
        return res.status(400).json({ error: 'Vacation limit reached for this year' });
      }

      // Create a new VACATION status entry
      const vacationStartDate = now;
      const vacationEndDate = new Date();
      vacationEndDate.setDate(vacationStartDate.getDate() + 14); // 2 weeks

      await prisma.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'VACATION',
          start_date: vacationStartDate,
          end_date: vacationEndDate,
          reason: 'User initiated vacation mode',
        },
      });

      res.status(200).json({ message: 'Vacation mode started', vacationEndDate });
    } catch (error) {
      console.error('Error starting vacation mode:', error);
      res.status(500).json({ error: 'Failed to start vacation mode' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(handler);