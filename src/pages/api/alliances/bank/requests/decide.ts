import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceGoldRequestService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  decision: z.enum(['approve', 'decline']),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Approves or declines a pending request (leader or manage_bank). */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { body: input } = context;

  try {
    const result = await AllianceGoldRequestService.decide({
      actorId: sessionUserId,
      allianceId: input.allianceId,
      requestId: input.requestId,
      decision: input.decision,
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
