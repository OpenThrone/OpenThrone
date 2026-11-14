import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  ChatModerationShadowService,
  SHADOW_REVIEW_OUTCOMES,
  ShadowReviewError,
} from '@/services/ChatModerationShadow.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const Schema = z.object({
  verdictId: z.number().int().positive(),
  outcome: z.enum(SHADOW_REVIEW_OUTCOMES),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MODERATE_CHAT],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof Schema> },
) {
  const { verdictId, outcome } = context.body;
  const reviewerId = Number(req.session?.user?.id);
  try {
    const reviewed = await prisma.$transaction(async (tx) => {
      const updated = await ChatModerationShadowService.review(
        verdictId,
        outcome,
        reviewerId,
        tx,
      );
      if (!updated) return null;
      await logActionStrict(
        {
          userId: reviewerId,
          action: 'ADMIN_CHAT_MODERATION_SHADOW_REVIEW',
          ip: getRequestIp(req),
          entityType: 'ChatModerationVerdict',
          entityId: verdictId,
          details: { outcome, policyAction: updated.policyAction },
        },
        tx,
      );
      return updated;
    });
    if (!reviewed) return res.status(404).json({ error: 'Verdict not found' });
    return res.status(200).json({ verdict: reviewed });
  } catch (error) {
    if (error instanceof ShadowReviewError)
      return res.status(400).json({ error: error.message });
    throw error;
  }
}

export default guardedHandler(handler);
