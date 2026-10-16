import type { NextApiResponse } from 'next';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';

const single = (value: string | string[] | undefined) =>
  Array.isArray(value) ? undefined : value;
const parseId = (value: string | string[] | undefined) => {
  const raw = single(value);
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_AUDIT_LOGS],
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const action = single(req.query.action)?.trim();
  const userId = parseId(req.query.userId);
  const targetUserId = parseId(req.query.targetUserId);
  const rawLimit = single(req.query.limit);
  const rawOffset = single(req.query.offset);
  const hasRepeatedFilter = Object.values(req.query).some(Array.isArray);
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  const offset = rawOffset === undefined ? 0 : Number(rawOffset);
  if (
    hasRepeatedFilter ||
    userId === null ||
    targetUserId === null ||
    (action !== undefined && action.length > 100) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  ) {
    return res.status(400).json({ error: 'Invalid audit log filters' });
  }
  const logs = await ModerationService.getAuditLogs({
    action: action || undefined,
    userId: userId ?? undefined,
    targetUserId: targetUserId ?? undefined,
    limit,
    offset,
  });
  return res.status(200).json(logs);
}

export default guardedHandler(handler);
