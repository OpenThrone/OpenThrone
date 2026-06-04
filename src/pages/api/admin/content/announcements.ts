import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AnnouncementService } from '@/services/Announcement.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  severity: z.string().optional(),
  isBanner: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dismissible: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  linkUrl: z.string().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_ANNOUNCEMENTS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Schema> },
) {
  if (req.method === 'GET') {
    const announcements = await AnnouncementService.list();
    return res.status(200).json(announcements);
  }

  if (req.method === 'POST') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const announcement = await AnnouncementService.create(Number(userId), {
      ...context.body!,
      startsAt: context.body!.startsAt ? new Date(context.body!.startsAt) : undefined,
      endsAt: context.body!.endsAt ? new Date(context.body!.endsAt) : undefined,
    });
    return res.status(201).json(announcement);
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
