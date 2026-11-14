import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceDuesService } from '@/services/AllianceDues.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorBody } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  /** Gold to pay towards arrears; capped at what is owed. */
  amount: z.union([
    z.number().int().positive().safe(),
    z.string().regex(/^[1-9]\d{0,14}$/),
  ]),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Pays the viewer's membership dues arrears from gold on hand. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof BodySchema> },
) => {
  try {
    const result = await AllianceDuesService.payArrears({
      allianceId: context.body.allianceId,
      userId: Number(req.session?.user?.id),
      amount: context.body.amount,
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
