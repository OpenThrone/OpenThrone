// pages/api/social/remove.ts
import prisma from "@/lib/prisma";
import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';
import type { AuthenticatedRequest } from '@/types/api';

const RemoveSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY'])
});

const removeSocialRelation = async (req: AuthenticatedRequest, res: NextApiResponse) => {
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
    const result = await prisma.social.deleteMany({
      where: {
        playerId,
        friendId,
        relationshipType,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        error: 'No active relationship found with the specified user'
      });
    }

    res.status(200).json({
      message: `${relationshipType} relationship removed successfully`,
      relationshipType
    });
  } catch (error) {
    console.error('Error removing relationship:', error);
    res.status(500).json({ error: 'Failed to remove relationship' });
  }
};

export default withAuth(removeSocialRelation);
