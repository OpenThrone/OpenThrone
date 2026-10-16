import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { AnnouncementService } from '@/services/Announcement.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';

const Schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  severity: z.string().optional(),
  isBanner: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dismissible: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  linkUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .nullable()
    .optional(),
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
    const { body } = context;
    if (!body)
      return res.status(400).json({ error: 'Announcement data is required' });

    const announcement = await AnnouncementService.create(Number(userId), {
      ...body,
      linkUrl: body.linkUrl ?? undefined,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    });
    await logAction(
      Number(userId),
      'ADMIN_ANNOUNCEMENT_CREATE',
      getRequestIp(req),
      { announcementId: announcement?.id ?? null },
    );
    return res.status(201).json(announcement);
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
