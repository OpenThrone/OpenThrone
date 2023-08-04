import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      // For demonstration, assuming a user ID of 1 (this should be fetched from the session in a real-world scenario)
      const userId = 221;

      // Fetch messages for the logged-in user, sorted by date_time in descending order
      const messages = await prisma.messages.findMany({
        where: {
          to_user_id: userId,
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
