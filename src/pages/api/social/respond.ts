import type { NextApiResponse } from 'next';

import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { emitSocialCountUpdate } from '@/utils/socialNotifications';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { requestId, action } = req.body ?? {};
  const userId = session.user.id;

  try {
    const request = await SocialService.getSocialRequestParticipants(
      Number(requestId),
    );

    const result = await SocialService.respondToRequest(userId, {
      requestId: Number(requestId),
      action,
    });

    const io = getSocketIO();
    await emitSocialCountUpdate(io, userId);
    if (request?.playerId) {
      await emitSocialCountUpdate(io, request.playerId);
    }

    return res.status(200).json(result);
  } catch (error) {
    logError('Error processing friend request:', error);
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(handler);
