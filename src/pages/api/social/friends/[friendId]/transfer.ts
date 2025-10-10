import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { highRiskLimiter, runExpressMiddleware } from '@/middleware/rateLimit';
import { z } from 'zod';
import { transferGoldToFriend } from '@/services/friendTransfer.service';
import { stringifyObj } from '@/utils/jsonHelpers';
import type { AuthenticatedRequest } from '@/types/api';

const TransferSchema = z.object({
  amount: z.string().transform(val => BigInt(val)),
  notes: z.string().optional(),
});

const transferHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
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
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { amount, notes } = parseResult.data;
  const fromUserId = session.user.id;

  try {
    // Check if user is trying to transfer to themselves
    if (fromUserId === friendIdNum) {
      return res.status(400).json({ error: 'Cannot transfer gold to yourself' });
    }

    const result = await transferGoldToFriend({
      fromUserId,
      toUserId: friendIdNum,
      amount,
      notes,
    });

    return res.status(200).json(stringifyObj({
      message: 'Gold transfer completed successfully',
      transferId: result.transferId,
      amount: amount.toString(),
    }));
  } catch (error) {
    console.error('Error transferring gold:', error);
    return res.status(400).json({ error: error.message });
  }
};

const wrapped = async (req: any, res: any) => {
  await runExpressMiddleware(req, res, highRiskLimiter);
  return transferHandler(req, res);
};

export default withAuth(wrapped);