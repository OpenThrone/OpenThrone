import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  key: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  rules: z.unknown().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'PUT', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_FEATURE_FLAGS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Schema> },
) {
  if (req.method === 'GET') {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
    return res.status(200).json(flags);
  }

  if (req.method === 'PUT') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await prisma.featureFlag.upsert({
        where: { key: context.body!.key },
        create: {
          key: context.body!.key,
          enabled: context.body!.enabled ?? false,
          description: context.body!.description,
          rules: context.body!.rules as object | undefined,
          createdByUserId: Number(userId),
        },
        update: {
          enabled: context.body!.enabled,
          description: context.body!.description,
          rules: context.body!.rules as object | undefined,
          updatedByUserId: Number(userId),
        },
      });
      return res.status(200).json(result);
    } catch (err) {
      logError('Failed to update flag:', err);
      return res.status(500).json({ error: 'Failed' });
    }
  }

  if (req.method === 'POST') {
    return handler(req, res, context);
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
