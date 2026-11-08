import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import UserModel from '@/models/Users';
import { getDepositHistory } from '@/services/Bank.service';
import { publicErrorMessage } from '@/utils/publicError';
import { getGameDayWindowCountdown } from '@/utils/timefunctions';

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

    const userMod = new UserModel(user);
    return res.status(200).json({
      deposits: userMod.maximumBankDeposits - history.length,
      nextDepositAvailable:
        history.length > 0
          ? getGameDayWindowCountdown(history[0].date_time)
          : 0,
    });
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(getDeposits);
