import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';

const prisma = new PrismaClient();

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch the bank history for the user
  const bankHistory = await prisma.bank_history.findMany({
    where: {
      OR: [
        {
          from_user_id: parseInt(session.player.id),
          from_user_account_type: 'HAND',
          to_user_account_type: 'BANK',
        },
        {
          to_user_id: parseInt(session.player.id),
          to_user_account_type: 'HAND',
          from_user_account_type: 'BANK',
        },
      ],
    },
    orderBy: {
      date_time: 'desc',
    },
  });

  return res.status(200).json(bankHistory);
};
