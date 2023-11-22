import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';
import UserModel from '@/models/Users';

const prisma = new PrismaClient();

export default async (req, res) => {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: {
      id: session.user.id,
    },
  });

  if (!user)
    return res.status(404).json({ error: 'User not found' });

  const history = await prisma.bank_history.count({
    where: {
      from_user_id: session.user.id,
      to_user_id: session.user.id,
      from_user_account_type: 'HAND',
      to_user_account_type: 'BANK',
      history_type: 'PLAYER_TRANSFER',
      date_time: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      },
    },
  });  

  const userMod = new UserModel(user);

  return res.status(200).json( userMod.maximumBankDeposits - history );
};
