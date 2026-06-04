import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'ACCEPTED', 'DENIED', 'WITHDRAWN']),
  decisionSummary: z.string().max(2000).optional(),
});

const guardedHandler = withApiGuard({
  methods: ['PUT', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_BAN_APPEALS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown; body: z.infer<typeof Schema> },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const appealId = Number((context.query as { appealId: string }).appealId);
  if (Number.isNaN(appealId)) {
    return res.status(400).json({ error: 'Invalid appeal ID' });
  }

  const appeal = await ModerationService.reviewBanAppeal(
    Number(userId),
    appealId,
    {
      status: context.body.status,
      decisionSummary: context.body.decisionSummary,
    },
  );
  return res.status(200).json(appeal);
}

export default guardedHandler(handler);
