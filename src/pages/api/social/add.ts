import type { NextApiResponse } from 'next';

import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import {
  emitFriendRequestNotification,
  emitSocialCountUpdate,
} from '@/utils/socialNotifications';

const addSocialRelation = async (
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

  const { friendId, relationshipType } = req.body ?? {};
  const playerId = session.user.id;

  try {
    const result = await SocialService.addRelationship(playerId, {
      friendId,
      relationshipType,
    });

    if (relationshipType === 'FRIEND') {
      const io = getSocketIO();
      await emitFriendRequestNotification(io, {
        senderId: playerId,
        recipientId: Number(friendId),
      });
      await emitSocialCountUpdate(io, Number(friendId));
    }

    res.status(200).json(result);
  } catch (error: any) {
    logError('Error adding relationship:', error);
    res.status(400).json({ error: error.message });
  }
};

export default withAuth(addSocialRelation);
