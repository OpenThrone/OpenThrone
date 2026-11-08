import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import {
  AllianceReactivationError,
  getReactivationProgress,
  reactivateAlliance,
} from '@/services/AllianceReactivation.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
});
const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'required',
});

/**
 * GET: the reactivation requirements and (for the leader) their standing.
 * POST: the leader pays to move a reserved alliance back to ACTIVE.
 */
const handler = async (req: AuthenticatedRequest, res: any) => {
  const sessionUserId = Number(req.session?.user?.id);
  try {
    if (req.method === 'GET') {
      const query = QuerySchema.safeParse(req.query);
      if (!query.success) {
        return res.status(400).json({ error: 'Invalid alliance' });
      }
      const progress = await getReactivationProgress(
        query.data.allianceId,
        sessionUserId,
      );
      return res.status(200).json(stringifyObj(progress));
    }
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid alliance' });
    }
    const result = await reactivateAlliance({
      allianceId: parsed.data.allianceId,
      actorId: sessionUserId,
      ip: getRequestIp(req),
    });
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    if (!(error instanceof AllianceReactivationError)) {
      logError('Alliance reactivation failed', error);
    }
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

// Per-account game_write budget and account-status check, like other game writes.
export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
