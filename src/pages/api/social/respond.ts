import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const RespondSchema = z.object({
  requestId: z.number().int(),
  action: z.enum(['accept', 'decline']),
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

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = RespondSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { requestId, action } = parseResult.data;
  const userId = session.user.id;

  try {
    const request = await prisma.social.findUnique({
      where: { id: requestId },
      select: { playerId: true, friendId: true },
    });

    const result = await SocialService.respondToRequest(userId, {
      requestId,
      action,
    });

    await emitSocialCountUpdate(userId);
    if (request?.playerId) {
      await emitSocialCountUpdate(request.playerId);
    }

    return res.status(200).json(result);
  } catch (error) {
    logError('Error processing friend request:', error);
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(handler);
