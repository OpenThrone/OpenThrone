import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  ChatModerationShadowService,
  SHADOW_LIST_MAX_LIMIT,
  SHADOW_LIST_MAX_OFFSET,
  SHADOW_VERDICT_ACTIONS,
} from '@/services/ChatModerationShadow.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const Schema = z.object({
  policyAction: z.enum(SHADOW_VERDICT_ACTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(SHADOW_LIST_MAX_LIMIT).default(25),
  offset: z.coerce.number().int().min(0).max(SHADOW_LIST_MAX_OFFSET).default(0),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHAT_LOGS],
  rateLimitProfile: 'admin',
  querySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Schema> },
) {
  const { policyAction, limit, offset } = context.query;
  const [list, summary] = await Promise.all([
    ChatModerationShadowService.list({ policyAction, limit, offset }),
    ChatModerationShadowService.summary(),
  ]);
  // Message excerpts are chat content, so reading them is audited.
  await logActionStrict({
    userId: Number(req.session?.user?.id),
    action: 'ADMIN_CHAT_MODERATION_SHADOW_READ',
    ip: getRequestIp(req),
    details: {
      policyAction: policyAction ?? null,
      limit,
      offset,
      resultCount: list.verdicts.length,
    },
  });
  return res.status(200).json({ ...list, summary });
}

export default guardedHandler(handler);
