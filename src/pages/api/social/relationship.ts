import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { NextApiResponse } from 'next';
import { z } from 'zod';
import type { AuthenticatedRequest } from '@/types/api';

const GetRelationshipSchema = z.object({
  userId: z.coerce.number().int(),
  targetUserId: z.coerce.number().int(),
});

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = GetRelationshipSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ 
      error: 'Invalid request parameters', 
      details: parseResult.error.flatten().fieldErrors 
    });
  }

  const { userId, targetUserId } = parseResult.data;

  try {
    // Check if the requesting user is the same as the userId parameter
    if (session.user.id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Find the relationship between the two users
    const relationship = await prisma.social.findFirst({
      where: {
        OR: [
          {
            playerId: userId,
            friendId: targetUserId,
            relationshipType: 'FRIEND',
          },
          {
            playerId: targetUserId,
            friendId: userId,
            relationshipType: 'FRIEND',
          },
        ],
      },
    });

    if (!relationship) {
      return res.status(200).json({ 
        relationship: null,
        canInteract: true,
        availableActions: ['add']
      });
    }

    // Determine available actions based on relationship status
    let availableActions = [];
    let canInteract = true;

    if (relationship.status === 'requested') {
      if (relationship.playerId === userId) {
        // Outgoing request
        availableActions = ['cancel'];
      } else {
        // Incoming request
        availableActions = ['accept', 'decline'];
      }
    } else if (relationship.status === 'accepted') {
      // Existing friendship
      availableActions = ['remove'];
    } else if (relationship.status === 'declined' || relationship.status === 'ended') {
      // Ended relationship
      availableActions = ['add'];
      canInteract = true;
    }

    return res.status(200).json({
      relationship,
      canInteract,
      availableActions,
    });
  } catch (error) {
    console.error('Error fetching relationship:', error);
    return res.status(500).json({ error: 'Failed to fetch relationship' });
  }
};

export default withAuth(handler);