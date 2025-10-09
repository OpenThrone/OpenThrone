import prisma from "@/lib/prisma";
import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { z } from 'zod';
import type { AuthenticatedRequest } from '@/types/api';

const AddSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY'])
});

const addSocialRelation = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = AddSocialSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { friendId, relationshipType } = parseResult.data;
  const playerId = session.user.id;
  console.log(req.body);
  console.log(relationshipType);

  try {
    // Check if user is trying to add relationship with themselves
    if (playerId === friendId) {
      return res.status(400).json({ error: 'Cannot create relationship with yourself' });
    }

    const social = await prisma.social.findFirst({
      where: {
        OR: [
          { AND: [
            { playerId },
            { friendId },
            { relationshipType },
          ] },
          { AND: [
            { playerId: friendId },
            { friendId: playerId },
            { relationshipType },
          ] }
        ]
      },
    });

    if (social) {
      if (social.status === 'requested') {
        return res.status(400).json({
          error: `A ${relationshipType.toLowerCase()} request is already pending between you and this user.`
        });
      } else if (social.status === 'accepted') {
        return res.status(400).json({
          error: `You already have an active ${relationshipType.toLowerCase()} relationship with this user.`
        });
      } else {
        return res.status(400).json({
          error: `A ${relationshipType.toLowerCase()} relationship already exists with this user.`
        });
      }
    }

    await prisma.social.create({
      data: {
        playerId,
        friendId,
        relationshipType,
        status: 'requested',
        requestDate: new Date(),
      },
    });
    
    res.status(200).json({
      message: `${relationshipType} request sent successfully`,
      relationshipType
    });
  } catch (error) {
    console.error('Error adding relationship:', error);
    res.status(500).json({ error: 'Failed to add relationship' });
  }
};

export default withAuth(addSocialRelation);
