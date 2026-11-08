import { z } from 'zod';

import { LOAN_INTEREST_PCT_MIN } from '@/constants/allianceTreasury';
import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceLoanService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  loan_term_days: z.number().int().min(1).max(365).optional(),
  loan_interest_pct: z
    .number()
    .int()
    .min(LOAN_INTEREST_PCT_MIN)
    .max(100)
    .optional(),
  member_daily_cap: z.coerce.bigint().min(0n).max(1000000000n).optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Leader-only: loan term, loan interest and the member daily cap. */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { allianceId, ...settings } = context.body;
  try {
    const result = await AllianceLoanService.updateTreasurySettings(
      allianceId,
      sessionUserId,
      settings,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

// Per-account game_write budget and account-status check, like other game writes.
export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
