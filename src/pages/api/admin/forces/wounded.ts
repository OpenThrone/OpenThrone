import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { adminHealAll } from '@/services/AdminForces.service';
import type { AuthenticatedRequest } from '@/types/api';
import {
  adminActor,
  FORCE_ADMIN_PERMISSIONS,
  sendForceError,
} from '@/utils/adminForcesApi';

export const WoundedQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
});

export const HealAllSchema = z
  .object({
    userId: z.number().int().positive(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: FORCE_ADMIN_PERMISSIONS,
  rateLimitProfile: 'admin',
  querySchema: WoundedQuerySchema,
  bodySchema: HealAllSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof WoundedQuerySchema>;
    body: z.infer<typeof HealAllSchema>;
  },
) {
  if (req.method === 'GET') {
    const { userId } = context.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, display_name: true, wounded_units: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({
      userId: user.id,
      displayName: user.display_name,
      wounded: Array.isArray(user.wounded_units) ? user.wounded_units : [],
    });
  }

  if (req.method === 'POST') {
    try {
      const plan = await adminHealAll(
        context.body.userId,
        adminActor(req),
        context.body.reason,
      );
      return res.status(200).json({ success: true, ...plan });
    } catch (err) {
      return sendForceError(res, err, 'Failed to heal wounded units:');
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
