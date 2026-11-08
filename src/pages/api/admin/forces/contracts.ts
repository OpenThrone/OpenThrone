import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { adminCloseContract } from '@/services/AdminForces.service';
import type { AuthenticatedRequest } from '@/types/api';
import { woundsByContract } from '@/utils/adminForces';
import {
  adminActor,
  FORCE_ADMIN_PERMISSIONS,
  sendForceError,
} from '@/utils/adminForcesApi';
import { stringifyObj } from '@/utils/numberFormatting';

const STATUSES = [
  'REQUESTED',
  'ACTIVE',
  'EXPIRED',
  'RECALLED',
  'DISMISSED',
  'DEPLETED',
  'CANCELLED',
] as const;

export const ContractQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().positive().optional(),
  allianceId: z.coerce.number().int().positive().optional(),
  status: z.enum(STATUSES).optional(),
  kind: z.enum(['MERCENARY', 'ALLIANCE']).optional(),
});

export const ContractActionSchema = z
  .object({
    contractId: z.number().int().positive(),
    action: z.enum(['EXPIRE', 'TERMINATE']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: FORCE_ADMIN_PERMISSIONS,
  rateLimitProfile: 'admin',
  querySchema: ContractQuerySchema,
  bodySchema: ContractActionSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof ContractQuerySchema>;
    body: z.infer<typeof ContractActionSchema>;
  },
) {
  if (req.method === 'GET') {
    const { limit, offset, userId, allianceId, status, kind } = context.query;
    const where: Prisma.ForceContractWhereInput = {
      ...(userId ? { userId } : {}),
      ...(allianceId ? { allianceId } : {}),
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
    };
    const [contracts, total] = await Promise.all([
      prisma.forceContract.findMany({
        where,
        include: {
          user: {
            select: { id: true, display_name: true, wounded_units: true },
          },
          alliance: { select: { id: true, name: true } },
          events: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { actor: { select: { id: true, display_name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.forceContract.count({ where }),
    ]);
    const rows = contracts.map(({ user, ...contract }) => ({
      ...contract,
      user: { id: user.id, display_name: user.display_name },
      woundedQuantity: Math.min(
        contract.survivingQuantity,
        woundsByContract(user.wounded_units).get(contract.id) ?? 0,
      ),
    }));
    return res.status(200).json(stringifyObj({ contracts: rows, total }));
  }

  if (req.method === 'POST') {
    const { contractId, action, reason } = context.body;
    try {
      const result = await adminCloseContract(
        contractId,
        action,
        adminActor(req),
        reason,
      );
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      return sendForceError(res, err, 'Failed to close force contract:');
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
