import type { NextApiResponse } from 'next';

import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { highRiskLimiter, runExpressMiddleware } from '@/middleware/rateLimit';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';
import {
  emitGoldRequestCountUpdate,
  emitSocialCountUpdate,
} from '@/utils/socialNotifications';

const respondHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'PUT') {
    return res.status(405).end();
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { requestId } = req.query;
  const requestIdNum = Number(requestId);

  if (isNaN(requestIdNum)) {
    return res.status(400).json({ error: 'Invalid request ID' });
  }

  const { action, message } = req.body ?? {};
  const userId = session.user.id;

  try {
    const participants =
      await SocialService.getGoldRequestParticipants(requestIdNum);
    const result = await SocialService.respondToGoldRequest(userId, {
      requestId: requestIdNum,
      action,
      message,
    });

    const io = getSocketIO();
    await emitSocialCountUpdate(io, userId);
    await emitGoldRequestCountUpdate(io, userId);
    if (participants?.from_user_id) {
      await emitSocialCountUpdate(io, participants.from_user_id);
      await emitGoldRequestCountUpdate(io, participants.from_user_id);
    }

    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    logError('Error responding to gold request:', error);
    return res.status(400).json({ error: error.message });
  }
};

const wrapped = async (req: any, res: any) => {
  await runExpressMiddleware(req, res, highRiskLimiter);
  return respondHandler(req, res);
};

export default withAuth(wrapped);
