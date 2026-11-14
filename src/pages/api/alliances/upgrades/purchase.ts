import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { ALLIANCE_LEVEL_MAX } from '@/constants/allianceLevels';
import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceUpgradeService } from '@/services/AllianceUpgrade.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorBody } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  /** The level being bought: the alliance's current level + 1. */
  level: z.number().int().min(1).max(ALLIANCE_LEVEL_MAX),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Buys the next Alliance Hall level with treasury gold (leader or upgrade_alliance). */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof BodySchema> },
) => {
  try {
    const result = await AllianceUpgradeService.purchase({
      allianceId: context.body.allianceId,
      actorId: Number(req.session?.user?.id),
      level: context.body.level,
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
