// pages/api/user.ts
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from './auth/[...nextauth]';

const prisma = new PrismaClient();

export default async (req, res) => {
  // Get the session on the server-side
  const session = await getServerSession(req, res, authOptions);

  // If there's no session, return an error
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Fetch the user based on the session's user ID
    const user = await prisma.users.findUnique({
      where: {
        id: parseInt(session.player.id),
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
