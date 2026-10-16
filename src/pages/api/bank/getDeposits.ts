import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { getDepositHistory } from '@/services/Bank.service';

const getDeposits = async (req: NextApiRequest, res: NextApiResponse) => {
  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const history = await getDepositHistory(Number(session.user.id));
    const user = await prisma.users.findUnique({
      where: { id: Number(session.user.id) },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const getCountdown = (timestamp: string) => {
      const targetDate = new Date(timestamp);
      targetDate.setHours(targetDate.getHours() + 24);
      const currentDate = new Date();
      const timeDiff = targetDate.getTime() - currentDate.getTime();

      if (timeDiff > 0) {
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        return { hours, minutes, seconds };
      }
      return { hours: 0, minutes: 0, seconds: 0 };
    };

    const userMod = new UserModel(user);
    return res.status(200).json({
      deposits: userMod.maximumBankDeposits - history.length,
      nextDepositAvailable:
        history.length > 0 ? getCountdown(history[0].date_time.toString()) : 0,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(getDeposits);
