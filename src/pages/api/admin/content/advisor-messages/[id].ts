import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const UpdateSchema = z.object({
  message: z.string().min(1).max(500).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_CONTENT],
  rateLimitProfile: 'admin',
  bodySchema: UpdateSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown; body: z.infer<typeof UpdateSchema> },
) {
  const id = Number((context.query as { id: string }).id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'PUT') {
    try {
      const updated = await prisma.advisor_messages.update({
        where: { id },
        data: context.body,
      });
      return res.status(200).json(updated);
    } catch (err) {
      logError('Failed to update advisor message:', err);
      return res
        .status(500)
        .json({ error: 'Failed to update advisor message' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.advisor_messages.delete({ where: { id } });
      return res.status(200).json({ success: true });
    } catch (err) {
      logError('Failed to delete advisor message:', err);
      return res
        .status(500)
        .json({ error: 'Failed to delete advisor message' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
