import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { ALLIANCE_DUES_PERIODS } from '@/constants/allianceDues';
import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceDuesService } from '@/services/AllianceDues.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorBody } from '@/utils/publicError';

/** Whole gold as a JSON number or digit string; bounds are checked by the service. */
const Gold = z.union([
  z.number().int().nonnegative().safe(),
  z.string().regex(/^\d{1,12}$/),
]);

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  joinFee: Gold,
  duesAmount: Gold,
  duesPeriod: z.enum(ALLIANCE_DUES_PERIODS),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Sets the join fee and membership dues (leader or set_dues). */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof BodySchema> },
) => {
  try {
    const result = await AllianceDuesService.updateSettings({
      allianceId: context.body.allianceId,
      actorId: Number(req.session?.user?.id),
      joinFee: context.body.joinFee,
      duesAmount: context.body.duesAmount,
      duesPeriod: context.body.duesPeriod,
    });
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json(publicErrorBody(error));
  }
};

// Per-account game_write budget and account-status check, like other game writes.
export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
