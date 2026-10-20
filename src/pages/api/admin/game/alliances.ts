import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { AllianceService } from '@/services/Alliance.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

export const AllianceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  allianceId: z.coerce.number().int().positive().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ALLIANCES],
  rateLimitProfile: 'admin',
  querySchema: AllianceQuerySchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof AllianceQuerySchema> },
) {
  if (req.method === 'GET') {
    const where: Record<string, unknown> = {};
    if (context.query.search) {
      where.name = { contains: context.query.search, mode: 'insensitive' };
    }
    const [alliances, total] = await Promise.all([
      prisma.alliances.findMany({
        where,
        include: {
          leader: { select: { id: true, display_name: true } },
          _count: { select: { members: true } },
        },
        orderBy: { created_at: 'desc' },
        take: context.query.limit,
        skip: context.query.offset,
      }),
      prisma.alliances.count({ where }),
    ]);
    // Alliances carry BigInt treasury columns (#66), which res.json cannot serialize.
    return res.status(200).json(stringifyObj({ alliances, total }));
  }

  if (req.method === 'DELETE') {
    const { allianceId } = context.query;
    if (!allianceId) {
      return res.status(400).json({ error: 'Invalid alliance ID' });
    }
    try {
      // Same teardown as a leader's disband (memberships, roles, rooms, wars
      // and the treasury payout); deleting the row directly failed on the
      // memberships foreign key.
      await AllianceService.adminDissolveAlliance(
        allianceId,
        async (tx, dissolved) => {
          // Commits with the deletion; a failed write rolls it back.
          await logActionStrict(
            {
              userId: Number(req.session?.user?.id),
              action: 'ADMIN_ALLIANCE_DISSOLVE',
              ip: getRequestIp(req),
              targetUserId: dissolved.leader_id,
              entityType: 'Alliance',
              entityId: dissolved.id,
              details: { name: dissolved.name },
            },
            tx,
          );
        },
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      logError('Failed to dissolve alliance:', err);
      return res.status(500).json({ error: 'Failed to dissolve' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
