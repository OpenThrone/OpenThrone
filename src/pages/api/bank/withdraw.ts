import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';

const prisma = new PrismaClient();

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const withdrawAmount = parseInt(req.body.withdrawAmount);

  // Fetch the user based on the session's user ID
  const user = await prisma.users.findUnique({
    where: {
      id: parseInt(session.user.id),
    },
  });
  if (withdrawAmount > user?.gold_in_bank) {
    return res.status(401).json({ error: `Not enough gold for deposit` });
  }

  await prisma.users.update({
    where: { id: parseInt(session.user.id) },
    data: {
      gold: user.gold + withdrawAmount,
      gold_in_bank: user?.gold_in_bank - withdrawAmount,
    },
  });

  await prisma.bank_history.create({
    data: {
      gold_amount: withdrawAmount,
      from_user_id: user.id,
      from_user_account_type: 'BANK',
      to_user_id: user.id,
      to_user_account_type: 'HAND',
      date_time: new Date().toISOString(),
      history_type: 'PLAYER_TRANSFER',
    },
  });

  // Return the updated user data or any other relevant response
  return res.status(200).json({ message: 'Deposit successful' });
};
