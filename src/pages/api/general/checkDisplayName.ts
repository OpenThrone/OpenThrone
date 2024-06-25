import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { displayName } = req.body;

    try {
      // Search for users with a displayName that contains the substring provided
      const users = await prisma.users.findMany({
        where: {
          display_name: {
            contains: displayName,
            mode: 'insensitive', // Case-insensitive search
          },
        },
        select: {
          display_name: true,
        },
      });

      const displayNames = users.map((user) => user.display_name);
      return res.status(200).json({
        exists: displayNames.length > 0,
        possibleMatches: displayNames,
      });
    } catch (error) {
      console.error('Error checking display name:', error);
      return res.status(500).json({ error: 'Failed to check display name.' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
}
