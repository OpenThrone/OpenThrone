import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ALLIANCES],
  rateLimitProfile: 'admin',
  querySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof Schema> & { allianceId?: string } },
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
    return res.status(200).json({ alliances, total });
  }

  if (req.method === 'DELETE') {
    const allianceId = Number(context.query.allianceId);
    if (Number.isNaN(allianceId)) {
      return res.status(400).json({ error: 'Invalid alliance ID' });
    }
    try {
      await prisma.alliances.delete({ where: { id: allianceId } });
      return res.status(200).json({ success: true });
    } catch (err) {
      logError('Failed to dissolve alliance:', err);
      return res.status(500).json({ error: 'Failed to dissolve' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
