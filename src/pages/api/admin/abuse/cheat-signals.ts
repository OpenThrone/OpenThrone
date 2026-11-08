import type { NextApiResponse } from 'next';

import {
  CheatSignalType,
  InvestigationStatus,
  PermissionType,
  SignalSeverity,
} from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CheatDetectionService } from '@/services/CheatDetection.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHEAT_SIGNALS],
  rateLimitProfile: 'admin',
});

const oneOf = <T extends string>(
  values: Record<string, T>,
  raw: unknown,
): T | undefined | null => {
  if (raw === undefined || raw === '') return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return Object.values(values).includes(value as T) ? (value as T) : null;
};

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const status = oneOf(InvestigationStatus, req.query.status);
  const severity = oneOf(SignalSeverity, req.query.severity);
  const type = oneOf(CheatSignalType, req.query.type);
  if (status === null || severity === null || type === null)
    return res.status(400).json({ error: 'Invalid filter' });
  const filters = {
    status,
    severity,
    type,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
    offset: Math.max(0, Number(req.query.offset) || 0),
  };
  if (filters.userId !== undefined && !Number.isSafeInteger(filters.userId))
    return res.status(400).json({ error: 'Invalid filter' });
  const signals = await CheatDetectionService.listSignals(filters);
  await logActionStrict({
    userId: Number(req.session?.user?.id),
    action: 'ADMIN_CHEAT_SIGNALS_READ',
    ip: getRequestIp(req),
    targetUserId: filters.userId ?? null,
    details: {
      status: filters.status ?? null,
      severity: filters.severity ?? null,
      ...(filters.type ? { type: filters.type } : {}),
      limit: filters.limit,
      offset: filters.offset,
      resultCount: signals.signals.length,
      total: signals.total,
    },
  });
  return res.status(200).json(signals);
}

export default guardedHandler(handler);
