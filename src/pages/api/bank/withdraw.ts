import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { withdrawGold } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'bank',
});

const withdrawHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const canProceed = await enforceIdempotency(req, res, {
    scope: `bank-withdraw:${req.body?.amount ?? 'unknown'}`,
    actorKey: String(req.session.user.id),
  });
  if (!canProceed) {
    return;
  }

  try {
    const updatedUser = await withdrawGold(
      Number(req.session.user.id),
      req.body?.amount,
    );
    return res.status(200).json({
      message: 'Withdraw successful',
      // Only the balances; the full user row leaked internal fields.
      data: stringifyObj({
        gold: updatedUser?.gold,
        gold_in_bank: updatedUser?.gold_in_bank,
      }),
    });
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default guardedHandler(withdrawHandler);
