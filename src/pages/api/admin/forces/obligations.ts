import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { adminCancelObligation } from '@/services/AdminForces.service';
import type { AuthenticatedRequest } from '@/types/api';
import {
  adminActor,
  FORCE_ADMIN_PERMISSIONS,
  sendForceError,
} from '@/utils/adminForcesApi';
import { stringifyObj } from '@/utils/numberFormatting';

export const ObligationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().positive().optional(),
  allianceId: z.coerce.number().int().positive().optional(),
  state: z.enum(['open', 'cancelled', 'all']).default('open'),
});

export const CancelObligationSchema = z
  .object({
    obligationId: z.number().int().positive(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: FORCE_ADMIN_PERMISSIONS,
  rateLimitProfile: 'admin',
  querySchema: ObligationQuerySchema,
  bodySchema: CancelObligationSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof ObligationQuerySchema>;
    body: z.infer<typeof CancelObligationSchema>;
  },
) {
  if (req.method === 'GET') {
    const { limit, offset, userId, allianceId, state } = context.query;
    const where: Prisma.ForceObligationWhereInput = {
      ...(userId ? { userId } : {}),
      ...(allianceId ? { allianceId } : {}),
      ...(state === 'open'
        ? { cancelledAt: null }
        : state === 'cancelled'
          ? { cancelledAt: { not: null } }
          : {}),
    };
    const [obligations, total] = await Promise.all([
      prisma.forceObligation.findMany({
        where,
        include: {
          user: { select: { id: true, display_name: true } },
          alliance: { select: { id: true, name: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.forceObligation.count({ where }),
    ]);
    return res.status(200).json(stringifyObj({ obligations, total }));
  }

  if (req.method === 'POST') {
    try {
      const result = await adminCancelObligation(
        context.body.obligationId,
        adminActor(req),
        context.body.reason,
      );
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      return sendForceError(res, err, 'Failed to cancel obligation:');
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
