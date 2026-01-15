// pages/api/social/remove.ts
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const RemoveSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY']),
});

const emitSocialCountUpdate = async (userId: number) => {
  const io = getSocketIO();
  if (!io) return;

  const [friendRequests, goldRequests] = await Promise.all([
    SocialService.countPendingRequests(userId),
    SocialService.countPendingGoldRequests(userId),
  ]);
  const totalCount = (friendRequests.count || 0) + (goldRequests.count || 0);
  io.to(`user-${userId}`).emit('socialCountUpdate', { count: totalCount });
};

const removeSocialRelation = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = RemoveSocialSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { friendId, relationshipType } = parseResult.data;
  const playerId = session.user.id;

  try {
    const result = await SocialService.removeRelationship(playerId, {
      friendId,
      relationshipType,
    });

    if (relationshipType === 'FRIEND') {
      await emitSocialCountUpdate(friendId);
    }

    res.status(200).json(result);
  } catch (error: any) {
    logError('Error removing relationship:', error);
    res.status(400).json({ error: error.message });
  }
};

export default withAuth(removeSocialRelation);
