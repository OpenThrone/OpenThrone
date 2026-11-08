import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  BattleVoidError,
  previewBattleVoid,
  VOID_REASON_MAX_LENGTH,
  voidBattle,
} from '@/services/BattleVoid.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const bodySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      attackLogId: z.number().int().positive(),
      goldMode: z.enum(['full', 'recovered']).default('full'),
    })
    .strict(),
  z
    .object({
      action: z.literal('confirm'),
      attackLogId: z.number().int().positive(),
      goldMode: z.enum(['full', 'recovered']).default('full'),
      reason: z.string().trim().min(1).max(VOID_REASON_MAX_LENGTH),
      planHash: z.string().length(64),
    })
    .strict(),
]);

/**
 * Admin void of a battle with compensation (#229). Same permission as Edit
 * Player's gold edits (administrator); the battle log is never rewritten.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema,
})(async (req: AuthenticatedRequest, res: NextApiResponse, { body }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const actorId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);
  try {
    if (body.action === 'preview') {
      const plan = await previewBattleVoid(body.attackLogId, body.goldMode);
      await logActionStrict({
        userId: actorId,
        action: 'ADMIN_BATTLE_VOID_PREVIEW',
        ip,
        targetUserId: plan.defenderId,
        entityType: 'attack_log',
        entityId: body.attackLogId,
        details: { planHash: plan.hash, goldMode: plan.goldMode },
      });
      return res.status(200).json({ plan });
    }
    const result = await voidBattle({
      logId: body.attackLogId,
      actorId,
      ip,
      reason: body.reason,
      goldMode: body.goldMode,
      planHash: body.planHash,
    });
    return res
      .status(200)
      .json({ voided: true, voidedAt: result.voidedAt, plan: result.plan });
  } catch (error) {
    if (error instanceof BattleVoidError)
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code });
    logError('Admin battle void failed', error);
    return res.status(500).json({ error: 'Failed to void battle' });
  }
});
