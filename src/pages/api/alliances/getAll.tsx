import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { NextApiRequest, NextApiResponse } from 'next';
import { authOptions } from '../auth/[...nextauth]';
const prisma = new PrismaClient();

export default async function getAll(req: NextApiRequest, res: NextApiResponse) {
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

  const Alliances = await prisma.alliances.findMany({
    include: {
      leader: {
        select: {
          display_name: true,
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              display_name: true,
            },
          },
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  

  return res.status(200).json(Alliances);
};