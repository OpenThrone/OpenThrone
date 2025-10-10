import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { highRiskLimiter, runExpressMiddleware } from '@/middleware/rateLimit';
import { z } from 'zod';
import { createGoldRequest } from '@/services/friendTransfer.service';
import { stringifyObj } from '@/utils/jsonHelpers';
import type { AuthenticatedRequest } from '@/types/api';

const RequestSchema = z.object({
  friendId: z.number().int(),
  amount: z.string().transform(val => BigInt(val)),
  notes: z.string().optional(),
});

const requestHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = RequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }

  const { friendId, amount, notes } = parseResult.data;
  const fromUserId = session.user.id;

  try {
    // Check if user is trying to request from themselves
    if (fromUserId === friendId) {
      return res.status(400).json({ error: 'Cannot create gold request for yourself' });
    }

    const result = await createGoldRequest({
      fromUserId,
      toUserId: friendId,
      amount,
      notes,
    });

    return res.status(201).json(stringifyObj({
      message: 'Gold request created successfully',
      requestId: result.requestId,
      amount: amount.toString(),
    }));
  } catch (error) {
    console.error('Error creating gold request:', error);
    return res.status(400).json({ error: error.message });
  }
};

const wrapped = async (req: any, res: any) => {
  await runExpressMiddleware(req, res, highRiskLimiter);
  return requestHandler(req, res);
};

export default withAuth(wrapped);