import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { adminReturnForce } from '@/services/AdminForces.service';
import type { AuthenticatedRequest } from '@/types/api';
import {
  adminActor,
  FORCE_ADMIN_PERMISSIONS,
  sendForceError,
} from '@/utils/adminForcesApi';
import { stringifyObj } from '@/utils/numberFormatting';

export const ReserveQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  allianceId: z.coerce.number().int().positive().optional(),
});

export const ReturnForceSchema = z
  .object({
    contractId: z.number().int().positive(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: FORCE_ADMIN_PERMISSIONS,
  rateLimitProfile: 'admin',
  querySchema: ReserveQuerySchema,
  bodySchema: ReturnForceSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof ReserveQuerySchema>;
    body: z.infer<typeof ReturnForceSchema>;
  },
) {
  if (req.method === 'GET') {
    const { limit, offset, allianceId } = context.query;
    const where = allianceId ? { allianceId } : {};
    const [reserves, total] = await Promise.all([
      prisma.forceReserve.findMany({
        where,
        include: {
          alliance: { select: { id: true, name: true } },
          contracts: {
            where: { status: { in: ['ACTIVE', 'REQUESTED'] } },
            include: { user: { select: { id: true, display_name: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: [{ allianceId: 'asc' }, { type: 'asc' }, { level: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.forceReserve.count({ where }),
    ]);
    return res.status(200).json(stringifyObj({ reserves, total }));
  }

  if (req.method === 'POST') {
    try {
      const result = await adminReturnForce(
        context.body.contractId,
        adminActor(req),
        context.body.reason,
      );
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      return sendForceError(res, err, 'Failed to return force:');
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
