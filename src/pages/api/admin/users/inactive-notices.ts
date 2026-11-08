import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  MAX_NOTICE_DAYS,
  MIN_NOTICE_DAYS,
  sendInactivityNotices,
} from '@/services/AccountInactivity.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

export const InactiveNoticeBody = z
  .object({
    userIds: z.array(z.number().int().positive()).min(1).max(1000).optional(),
    all: z.boolean().default(false),
    inactiveSince: z.coerce.date().optional(),
    noticeDays: z.coerce
      .number()
      .int()
      .min(MIN_NOTICE_DAYS)
      .max(MAX_NOTICE_DAYS)
      .default(180),
    template: z.enum(['STANDARD', 'ERA_RELAUNCH']).default('STANDARD'),
    newsPostId: z.coerce.number().int().positive().nullish(),
  })
  .refine((v) => v.all || !!v.userIds?.length)
  // The relaunch copy links to a news post; without one the link is dead.
  .refine((v) => v.template !== 'ERA_RELAUNCH' || !!v.newsPostId, {
    message: 'The relaunch template needs a news post',
    path: ['newsPostId'],
  });
export default withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  bodySchema: InactiveNoticeBody,
})(async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof InactiveNoticeBody> },
) => {
  try {
    const { inactiveSince, noticeDays, template, newsPostId } = context.body;
    // A relaunch wave points readers at a news post; refuse a dead link.
    if (newsPostId) {
      const post = await prisma.blog_posts.findUnique({
        where: { id: newsPostId },
        select: { id: true },
      });
      if (!post)
        return res
          .status(422)
          .json({ error: 'News post not found for the relaunch template' });
    }
    return res.status(200).json(
      await sendInactivityNotices({
        userIds: context.body.all ? undefined : context.body.userIds,
        actorId: Number(req.session.user.id),
        ip: getRequestIp(req),
        inactiveSince,
        noticeDays,
        template,
        newsPostId: newsPostId ?? null,
      }),
    );
  } catch {
    logError('Inactivity notice send failed');
    return res.status(500).json({ error: 'Failed to send inactivity notices' });
  }
});
