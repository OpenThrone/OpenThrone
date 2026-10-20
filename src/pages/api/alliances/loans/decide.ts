import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceLoanService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  loanId: z.number().int().positive(),
  decision: z.enum(['approve', 'decline']),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Approves or declines a loan request (leader or manage_bank). */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { body: input } = context;
  try {
    const result = await AllianceLoanService.decide({
      actorId: sessionUserId,
      allianceId: input.allianceId,
      loanId: input.loanId,
      decision: input.decision,
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
