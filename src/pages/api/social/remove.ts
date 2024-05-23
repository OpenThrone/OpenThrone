// pages/api/social/remove.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const removeSocialRelation = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { friendId, relationshipType } = req.body;
  const playerId = session.user.id;

  try {
    await prisma.social.deleteMany({
      where: {
        playerId,
        friendId,
        relationshipType,
      },
    });
    res.status(200).json({ message: 'Relationship removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove relationship' });
  }
};

export default withAuth(removeSocialRelation);
