import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { depositGold } from '@/services/Bank.service';
import { markGameplayActivity } from '@/services/GameplayActivity.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'bank',
});

const depositHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const canProceed = await enforceIdempotency(req, res, {
    scope: `bank-deposit:${req.body?.amount ?? 'unknown'}`,
    actorKey: String(req.session.user.id),
  });
  if (!canProceed) {
    return;
  }

  try {
    const updatedUser = await depositGold(
      Number(req.session.user.id),
      req.body?.amount,
    );
    await markGameplayActivity(Number(req.session.user.id));
    return res.status(200).json({
      message: 'Deposit successful', // Only the balances; the full user row leaked internal fields.
      data: stringifyObj({
        gold: updatedUser?.gold,
        gold_in_bank: updatedUser?.gold_in_bank,
      }),
    });
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default guardedHandler(depositHandler);
