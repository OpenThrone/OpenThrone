import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { enforceIdempotency } from '@/middleware/idempotency';
import { AllianceBankService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';

const WithdrawDetailsSchema = z.object({
  allianceId: z.number().int().positive(),
  targetUserId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1), 'Amount must be positive'),
  notes: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'bank',
  bodySchema: WithdrawDetailsSchema,
});

const withdrawHandler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof WithdrawDetailsSchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { allianceId, targetUserId, amount, notes } = context.body;
  const canProceed = await enforceIdempotency(req, res, {
    scope: `alliance-bank-withdraw:${allianceId}:${targetUserId}:${amount.toString()}`,
    actorKey: String(sessionUserId),
  });
  if (!canProceed) {
    return;
  }

  try {
    const result = await AllianceBankService.withdraw({
      requesterId: sessionUserId,
      allianceId,
      targetUserId,
      amount,
      notes,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default guardedHandler(withdrawHandler);
