import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { NextApiRequest, NextApiResponse } from 'next';

import { authOptions } from '../auth/[...nextauth]';
import UserModel from '@/models/Users';
import { stringifyObj } from '@/utils/numberFormatting';

const prisma = new PrismaClient();

export default async function getDeposits(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = typeof session.user.id === 'string' ? parseInt(session.user.id) : session.user.id as number;

  const user = await prisma.users.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user)
    return res.status(404).json({ error: 'User not found' });

  const history = await prisma.bank_history.findMany({
    where: {
      from_user_id: userId,
      to_user_id: userId,
      from_user_account_type: 'HAND',
      to_user_account_type: 'BANK',
      history_type: 'PLAYER_TRANSFER',
      date_time: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      },
    },
    orderBy: {
      date_time: 'asc',
    },
  });

  const getCountdown = (timestamp: string) => {
    // Define the target date by adding 24 hours to the given timestamp
    var targetDate = new Date(timestamp);
    targetDate.setHours(targetDate.getHours() + 24);

    // Get the current date
    var currentDate = new Date();

    // Calculate the difference in milliseconds
    var timeDiff = targetDate - currentDate;

    if (timeDiff > 0) {
      // Convert the time difference from milliseconds to hours, minutes, and seconds
      var hours = Math.floor(timeDiff / (1000 * 60 * 60));
      var minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      var seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

      // Return the countdown time as a string
      return { hours, minutes, seconds };
    } else {
      // If the current date is past the target date
      return {hours: 0, minutes: 0, seconds: 0}
    }
  }

  const userMod = new UserModel(user);

  return res.status(200).json({ deposits: userMod.maximumBankDeposits - history.length, nextDepositAvailable: history.length > 0 ? getCountdown(history[0].date_time.toString()):0 } );
};
