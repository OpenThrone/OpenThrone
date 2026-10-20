import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  roleId: z.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Changes a lower-ranked member's rank (grant_access permission). */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { body } = context;

  try {
    const result = await AllianceService.changeMemberRole(sessionUserId, {
      allianceId: body.allianceId,
      userId: body.userId,
      roleId: body.roleId,
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
