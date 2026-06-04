import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AnnouncementService } from '@/services/Announcement.service';
import type { AuthenticatedRequest } from '@/types/api';

const UpdateSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(10000).optional(),
  severity: z.string().optional(),
  isBanner: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dismissible: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  linkUrl: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ANNOUNCEMENTS],
  rateLimitProfile: 'admin',
  bodySchema: UpdateSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown; body: z.infer<typeof UpdateSchema> },
) {
  const id = Number((context.query as { id: string }).id);
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'PUT') {
    const updated = await AnnouncementService.update(Number(userId), id, {
      ...(context.body as Record<string, unknown>),
      startsAt: context.body.startsAt
        ? new Date(context.body.startsAt)
        : undefined,
      endsAt: context.body.endsAt ? new Date(context.body.endsAt) : undefined,
    } as any);
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await AnnouncementService.delete(id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
