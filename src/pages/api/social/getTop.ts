// pages/api/social/getTop.ts
import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';

const GetTopSocialQuerySchema = z.object({
  type: z.enum(['FRIEND', 'ENEMY'])
});

const getTopSocialRelations = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = GetTopSocialQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid query parameter', details: parseResult.error.flatten().fieldErrors });
  }

  const playerId = session.user.id;
  const { type } = parseResult.data;

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
