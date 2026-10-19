import type { NextApiResponse } from 'next';

import {
  FRIEND_TRANSFER_NOTE_MAX_LENGTH,
  parseFriendTransferAmount,
} from '@/constants/FriendTransfer';
import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { highRiskLimiter } from '@/middleware/rateLimit';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getIpAddress } from '@/utils/ipUtils';
import { stringifyObj } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';
import {
  emitGoldRequestCountUpdate,
  emitGoldRequestNotification,
  emitSocialCountUpdate,
} from '@/utils/socialNotifications';

const requestHandler = async (
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

  const { friendId, amount: rawAmount, notes } = req.body ?? {};
  const fromUserId = session.user.id;

  if (!Number.isSafeInteger(friendId) || friendId <= 0) {
    return res.status(400).json({ error: 'Invalid friend' });
  }
  const amount = parseFriendTransferAmount(rawAmount);
  if (amount === null) {
    return res
      .status(400)
      .json({ error: 'Amount must be a positive whole number' });
  }
  if (
    notes !== undefined &&
    (typeof notes !== 'string' ||
      notes.length > FRIEND_TRANSFER_NOTE_MAX_LENGTH)
  ) {
    return res.status(400).json({
      error: `Notes must be ${FRIEND_TRANSFER_NOTE_MAX_LENGTH} characters or fewer`,
    });
  }

  try {
    const result = await SocialService.createGoldRequest(fromUserId, {
      friendId,
      amount,
      notes,
    });

    const io = getSocketIO();
    await emitGoldRequestNotification(io, {
      senderId: fromUserId,
      recipientId: Number(friendId),
    });
    await emitSocialCountUpdate(io, Number(friendId));
    await emitGoldRequestCountUpdate(io, Number(friendId));

    return res.status(201).json(stringifyObj(result));
  } catch (error: any) {
    logError('Error creating gold request:', error);
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

const wrapped = async (req: any, res: any) => {
  const ip = getIpAddress(req);
  const allowed = await highRiskLimiter(ip);
  if (!allowed) {
    return res
      .status(429)
      .json({ error: 'Too many requests. Please slow down.' });
  }
  return requestHandler(req, res);
};

export default withAuth(wrapped);
