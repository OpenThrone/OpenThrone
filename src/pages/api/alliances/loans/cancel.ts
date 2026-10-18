import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceLoanService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  loanId: z.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Cancels the caller's own pending loan request. */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { body: input } = context;
  try {
    const result = await AllianceLoanService.cancel({
      userId: sessionUserId,
      allianceId: input.allianceId,
      loanId: input.loanId,
    });
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

// Per-account game_write budget and account-status check, like other game writes.
export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
