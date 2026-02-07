import md5 from 'md5';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';

const TransferQuerySchema = z.object({
  friendId: z.coerce.number().int().positive(),
});

const TransferSchema = z.object({
  amount: z.string().transform((val) => BigInt(val)),
  notes: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'bank',
  querySchema: TransferQuerySchema,
  bodySchema: TransferSchema,
});

const transferHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof TransferQuerySchema>;
    body: z.infer<typeof TransferSchema>;
  },
) => {
  const friendIdNum = context.query.friendId;
  const { amount, notes } = context.body;
  const fromUserId = Number(req.session?.user?.id);
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

export default guardedHandler(transferHandler);
