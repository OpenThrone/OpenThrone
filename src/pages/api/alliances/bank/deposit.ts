import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { AllianceBankService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const DepositDetailsSchema = z.object({
  allianceId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1), 'Amount must be positive'),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'bank',
  bodySchema: DepositDetailsSchema,
});

const depositHandler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof DepositDetailsSchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { allianceId, amount } = context.body;
  const canProceed = await enforceIdempotency(req, res, {
    scope: `alliance-bank-deposit:${allianceId}:${amount.toString()}`,
    actorKey: String(sessionUserId),
  });
  if (!canProceed) {
    return;
  }

  try {
    const result = await AllianceBankService.deposit({
      userId: sessionUserId,
      allianceId,
      amount,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default guardedHandler(depositHandler);
