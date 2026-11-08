import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  DAY_MS,
  MAX_NOTICE_DAYS,
  MIN_NOTICE_DAYS,
  parsePurgeDate,
  sendInactivityNotices,
} from '@/services/AccountInactivity.service';
import { sendImmediate, unsubscribeHeaders } from '@/services/Email.service';
import { renderEmail } from '@/services/emailTemplates';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { createInactivityErasureToken } from '@/utils/inactivityErasureToken';
import { logError } from '@/utils/logger';

export const InactiveNoticeBody = z
  .object({
    /** send = notify players; preview/test render for the admin only. */
    action: z.enum(['send', 'preview', 'test']).default('send'),
    userIds: z.array(z.number().int().positive()).min(1).max(1000).optional(),
    all: z.boolean().default(false),
    inactiveSince: z.coerce.date().optional(),
    noticeDays: z.coerce
      .number()
      .int()
      .min(MIN_NOTICE_DAYS)
      .max(MAX_NOTICE_DAYS)
      .default(180),
    /** Purge date (YYYY-MM-DD, UTC); overrides noticeDays. */
    deletionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    template: z.enum(['STANDARD', 'ERA_RELAUNCH']).default('STANDARD'),
    newsPostId: z.coerce.number().int().positive().nullish(),
    /** Preview/test language; defaults to the admin's own locale. */
    locale: z.enum(['en', 'de', 'es']).optional(),
  })
  .refine((v) => v.action !== 'send' || v.all || !!v.userIds?.length)
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
    const { action, inactiveSince, noticeDays, template, newsPostId } =
      context.body;
    const now = new Date();
    let deletionDate: Date | undefined;
    if (context.body.deletionDate) {
      deletionDate =
        parsePurgeDate(context.body.deletionDate, now) ?? undefined;
      if (!deletionDate)
        return res.status(422).json({
          error: `The purge date must be ${MIN_NOTICE_DAYS}–${MAX_NOTICE_DAYS} days from today`,
        });
    }
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
    const actorId = Number(req.session.user.id);
    if (action === 'preview' || action === 'test') {
      const admin = await prisma.users.findUnique({
        where: { id: actorId },
        select: {
          email: true,
          locale: true,
          display_name: true,
          last_active: true,
        },
      });
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const rendered = renderEmail({
        kind: 'INACTIVITY_NOTICE',
        locale: context.body.locale ?? admin.locale,
        vars: {
          userId: actorId,
          display_name: admin.display_name,
          lastActiveDate: admin.last_active ?? undefined,
          deletionDate:
            deletionDate ?? new Date(now.getTime() + noticeDays * DAY_MS),
          // Shows the real link shape; staff have no notice, so it won't erase.
          erasureToken: createInactivityErasureToken(actorId, now),
          ...(template === 'ERA_RELAUNCH'
            ? { relaunch: true, newsId: newsPostId ?? undefined }
            : {}),
        },
      });
      await prisma.$transaction(async (tx) => {
        await logActionStrict(
          {
            userId: actorId,
            action:
              action === 'test'
                ? 'ADMIN_INACTIVITY_NOTICE_TEST'
                : 'ADMIN_INACTIVITY_NOTICE_PREVIEW',
            ip: getRequestIp(req),
            details: { template, newsPostId: newsPostId ?? null },
          },
          tx,
        );
      });
      if (action === 'test') {
        await sendImmediate({
          to: admin.email,
          ...rendered,
          headers: unsubscribeHeaders(actorId, 'ACCOUNT_LIFECYCLE'),
        });
        return res.status(200).json({ testSent: true });
      }
      return res.status(200).json(rendered);
    }
    return res.status(200).json(
      await sendInactivityNotices({
        userIds: context.body.all ? undefined : context.body.userIds,
        actorId,
        ip: getRequestIp(req),
        inactiveSince,
        noticeDays,
        deletionDate,
        template,
        newsPostId: newsPostId ?? null,
      }),
    );
  } catch {
    logError('Inactivity notice send failed');
    return res.status(500).json({ error: 'Failed to send inactivity notices' });
  }
});
