import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { withdrawGold } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

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
    scope: `bank-withdraw:${req.body?.withdrawAmount ?? 'unknown'}`,
    actorKey: String(req.session.user.id),
  });
  if (!canProceed) {
    return;
  }

  try {
    const updatedUser = await withdrawGold(
      Number(req.session.user.id),
      req.body?.withdrawAmount,
    );
    return res.status(200).json({
      message: 'Withdraw successful',
      data: stringifyObj(updatedUser),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default guardedHandler(withdrawHandler);
