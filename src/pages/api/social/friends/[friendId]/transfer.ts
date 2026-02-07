import md5 from 'md5';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { enforceIdempotency } from '@/middleware/idempotency';
import { highRiskLimiter, runExpressMiddleware } from '@/middleware/rateLimit';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';

const TransferSchema = z.object({
  amount: z.string().transform((val) => BigInt(val)),
  notes: z.string().optional(),
});

const transferHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session } = req;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { friendId } = req.query;
  const friendIdNum = Number(friendId);

  if (isNaN(friendIdNum)) {
    return res.status(400).json({ error: 'Invalid friend ID' });
  }

  const parseResult = TransferSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { amount, notes } = parseResult.data;
  const fromUserId = session.user.id;
  const canProceed = await enforceIdempotency(req, res, {
    scope: `social-transfer:${friendIdNum}:${amount.toString()}`,
    actorKey: String(fromUserId),
  });
  if (!canProceed) {
    return;
  }

  try {
    const result = await SocialService.transferGoldToFriend(
      fromUserId,
      friendIdNum,
      amount,
      notes,
    );

    if (result?.success) {
      const sender = await prisma.users.findUnique({
        where: { id: fromUserId },
        select: { display_name: true },
      });
      const senderName = sender?.display_name || 'someone';
      const amountLabel = result?.amount ?? amount.toString();
      const message = `You received ${amountLabel} gold from ${senderName}`;
      const hash = md5(message + friendIdNum + result?.transferId);
      const io = getSocketIO();
      io?.to(`user-${friendIdNum}`).emit('goldTransferReceived', {
        message,
        hash,
        fromUserId,
        transferId: result?.transferId,
        amount: amountLabel,
      });
    }

    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    logError('Error transferring gold:', error);
    return res.status(400).json({ error: error.message });
  }
};

const wrapped = async (req: any, res: any) => {
  await runExpressMiddleware(req, res, highRiskLimiter);
  return transferHandler(req, res);
};

export default withAuth(wrapped);
