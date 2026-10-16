import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { adminCombatDetails } from '@/utils/adminCombat';
import { logError } from '@/utils/logger';

const QuerySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  playerId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  type: z.enum(['attack', 'INTEL', 'ASSASSINATE', 'INFILTRATE']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_ANALYTICS],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
});

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const { id, playerId, page, type, from, to } = context.query;
    if (from && to && new Date(from).getTime() > new Date(to).getTime())
      return res.status(400).json({ error: 'Start must precede end' });
    const select = {
      id: true,
      timestamp: true,
      type: true,
      winner: true,
      pillaged_gold: true,
      attacker_losses_total: true,
      defender_losses_total: true,
      attackerPlayer: { select: { id: true, display_name: true } },
      defenderPlayer: { select: { id: true, display_name: true } },
    } as const;
    if (id) {
      const log = await prisma.attack_log.findUnique({
        where: { id },
        select: { ...select, stats: true },
      });
      if (!log) return res.status(404).json({ error: 'Attack not found' });
      const { stats, ...summary } = log;
      return res.status(200).json({
        ...summary,
        pillaged_gold: log.pillaged_gold?.toString() ?? null,
        details: adminCombatDetails(stats),
      });
    }
    const where: Prisma.attack_logWhereInput = {
      ...(playerId
        ? { OR: [{ attacker_id: playerId }, { defender_id: playerId }] }
        : {}),
      ...(type ? { type } : {}),
      ...(from || to
        ? {
            timestamp: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const [total, logs] = await Promise.all([
      prisma.attack_log.count({ where }),
      prisma.attack_log.findMany({
        where,
        select,
        orderBy: { id: 'desc' },
        take: 50,
        skip: (page - 1) * 50,
      }),
    ]);
    return res.status(200).json({
      total,
      page,
      pageSize: 50,
      logs: logs.map((log) => ({
        ...log,
        pillaged_gold: log.pillaged_gold?.toString() ?? null,
      })),
    });
  } catch (error) {
    logError('Failed to load admin combat ledger', error);
    return res.status(500).json({ error: 'Failed to load attacks' });
  }
}
export default guard(handler);
