import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      const session = await getServerSession(req, res, authOptions);
      // Fetch messages for the logged-in user, sorted by date_time in descending order
      const messages = await prisma.messages.findMany({
        where: {
          to_user_id: session.user?.id,
        },
        orderBy: {
          date_time: 'desc',
        },
      });

      res.status(200).json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages.' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed.' });
  }
}
