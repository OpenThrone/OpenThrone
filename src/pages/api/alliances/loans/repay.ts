import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { enforceIdempotency } from '@/middleware/idempotency';
import { AllianceLoanService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1), 'Amount must be positive'),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Repays the caller's open loan from gold on hand. */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { body: input } = context;
  const canProceed = await enforceIdempotency(req, res, {
    scope: `alliance-loan-repay:${input.allianceId}:${input.amount.toString()}`,
    actorKey: String(sessionUserId),
  });
  if (!canProceed) {
    return;
  }
  try {
    const result = await AllianceLoanService.repay({
      userId: sessionUserId,
      allianceId: input.allianceId,
      amount: input.amount,
    });
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

// Per-account game_write budget and account-status check, like other game writes.
export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
