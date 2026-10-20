import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { startNewEra } from '@/services/Era.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { parseStartEraBody } from '@/utils/eraStartSettings';
import { logError } from '@/utils/logger';
import { getEraParticipantWhere } from '@/utils/loginPolicy';

// Read-only era listing stays open to MANAGE_ERAS holders.
const guardedGet = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ERAS],
  rateLimitProfile: 'admin',
})(async (_req: AuthenticatedRequest, res: NextApiResponse) => {
  const eras = await prisma.era.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { userEras: true } } },
  });
  // Ended eras are counted from their UserEra snapshots, which are written
  // when an era ends; the open era counts its current participants instead.
  const withPlayers = await Promise.all(
    eras.map(async (era) => ({
      ...era,
      players: era.endDate
        ? era._count.userEras
        : await prisma.users.count({
            where: await getEraParticipantWhere(era),
          }),
    })),
  );
  return res.status(200).json(withPlayers);
});

// Starting an era resets every account, so it is admin-only (matches start-era.ts).
const guardedStart = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
})(async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const parsed = parseStartEraBody(req.body);
  if (parsed.ok === false) {
    return res.status(400).json({ error: parsed.error });
  }

  const adminUserId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);

  // An era start resets every account, so it never runs off the record.
  try {
    await logActionStrict({
      userId: adminUserId,
      action: 'ADMIN_ERA_START_REQUESTED',
      ip,
      details: { route: 'game/eras' },
    });
  } catch (err) {
    logError('Era start refused: audit write failed', err);
    return res.status(500).json({ error: 'Failed to start new era' });
  }

  try {
    const newEra = await startNewEra(parsed.settings);
    await logAction(adminUserId, 'ADMIN_ERA_START', ip, {
      newEraId: newEra.id,
    });
    return res.status(200).json(newEra);
  } catch (err) {
    logError('Failed to start new era:', err);
    await logAction(adminUserId, 'ADMIN_ERA_START_FAILED', ip, {});
    return res.status(500).json({ error: 'Failed to start new era' });
  }
});

export default async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    return guardedStart(req, res);
  }
  return guardedGet(req, res);
}
