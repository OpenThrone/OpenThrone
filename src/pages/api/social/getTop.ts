// pages/api/social/getTop.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const getTopSocialRelations = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const playerId = session.user.id;
  const { type } = req.query;

  if (!['FRIEND', 'ENEMY'].includes(type)) {
    return res.status(400).json({ error: 'Invalid relationship type' });
  }

  try {
    const relations = await prisma.social.findMany({
      where: {
        playerId,
        relationshipType: type,
      },
      take: 5,
      include: {
        friend: true,
      },
    });
    res.status(200).json(relations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get relationships' });
  }
};

export default withAuth(getTopSocialRelations);
