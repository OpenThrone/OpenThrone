import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { NextApiRequest, NextApiResponse } from 'next';
import { authOptions } from '../auth/[...nextauth]';
const prisma = new PrismaClient();

export default async function history (req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!session.user.id) {
    return res.status(400).json({ error: 'Invalid user' });
  }

  // Fetch the bank history for the user
  const bankHistory = await prisma.bank_history.findMany({
    where: {
      OR: [
        {
          from_user_id: typeof(session.user.id) === 'string' ? parseInt(session.user.id): session.user.id,
          from_user_account_type: 'HAND',
          to_user_account_type: 'BANK',
        },
        {
          to_user_id: typeof (session.user.id) === 'string' ? parseInt(session.user.id) : session.user.id,
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