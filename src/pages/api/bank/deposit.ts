import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { depositGold } from '@/services/Bank.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

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
    return res
      .status(200)
      .json({ message: 'Deposit successful', data: stringifyObj(updatedUser) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default guardedHandler(depositHandler);
