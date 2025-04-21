// pages/api/social/remove.ts
import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';

const RemoveSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY'])
});

const removeSocialRelation = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = RemoveSocialSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { friendId, relationshipType } = parseResult.data;
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
