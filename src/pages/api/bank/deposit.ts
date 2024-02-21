import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';
import UserModel from '@/models/Users';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();

export default async function depositHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const depositAmount = parseInt(req.body.depositAmount);

  // Fetch the user based on the session's user ID
  const user = await prisma.users.findUnique({
    where: {
      id: Number(session.user.id),
    },
  });

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userMod = new UserModel(user);

  const depositCount = async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const transferCount = await prisma.bank_history.count({
      where: {
        AND: [
          { history_type: 'PLAYER_TRANSFER' },
          { from_user_id: user.id },
          { to_user_id: user.id },
          { to_user_account_type: 'BANK' },
          {
            date_time: {
              gte: oneDayAgo,
            },
          },
        ],
      },
    });
    return transferCount;
  };

  if (await depositCount() >= userMod.maximumBankDeposits) {
    return res.status(401).json({ error: `You can only deposit ${userMod.maximumBankDeposits} times per day` });
  }

  if (depositAmount > userMod.gold) {
    return res.status(401).json({ error: `Not enough gold for deposit` });
  }

  await prisma.users.update({
    where: { id: Number(userMod.id) },
    data: {
      gold: user.gold - depositAmount,
      gold_in_bank: user?.gold_in_bank + depositAmount,
    },
  });

  await prisma.bank_history.create({
    data: {
      gold_amount: depositAmount,
      from_user_id: user.id,
      from_user_account_type: 'HAND',
      to_user_id: user.id,
      to_user_account_type: 'BANK',
      date_time: new Date().toISOString(),
      history_type: 'PLAYER_TRANSFER',
    },
  });

  // Return the updated user data or any other relevant response
  return res.status(200).json({ message: 'Deposit successful' });
};
