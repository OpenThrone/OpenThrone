import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  queueNewsEmail,
  releaseNewsEmail,
} from '@/services/AdminEmail.service';
import { forEachEligibleRecipientBatch } from '@/services/Email.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const Schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  excerpt: z.string().max(500).optional(),
  slug: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  kind: z.enum(['BLOG', 'NEWS', 'CHANGELOG']).default('BLOG'),
  isPinned: z.boolean().default(false),
  sendEmail: z.boolean().default(false),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_CONTENT],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

export async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Schema> },
) {
  if (req.method === 'GET' && req.query.emailCount === 'true') {
    if (!(await isAdmin(Number(req.session.user.id))))
      return res
        .status(403)
        .json({ error: 'News email requires ADMINISTRATOR' });
    try {
      let count = 0;
      await forEachEligibleRecipientBatch(
        { category: 'NEWS', includeAll: true },
        250,
        async (batch) => {
          count += batch.length;
        },
      );
      await prisma.$transaction(async (tx) => {
        await logActionStrict(
          {
            userId: Number(req.session.user.id),
            action: 'ADMIN_NEWS_EMAIL_COUNT',
            ip: getRequestIp(req),
            details: { count },
          },
          tx,
        );
      });
      return res.status(200).json({ count });
    } catch {
      logError('Failed to count news email recipients');
      return res.status(500).json({ error: 'Failed to count recipients' });
    }
  }
  if (req.method === 'GET') {
    const posts = await prisma.$transaction(async (tx) => {
      await logActionStrict(
        {
          userId: Number(req.session.user.id),
          action: 'ADMIN_POSTS_READ',
          ip: getRequestIp(req),
        },
        tx,
      );
      const rows = await tx.blog_posts.findMany({
        orderBy: { created_timestamp: 'desc' },
        include: { postedBy: { select: { id: true, display_name: true } } },
      });
      const campaigns = await tx.emailCampaign.findMany({
        where: { kind: 'NEWS', blogPostId: { in: rows.map((p) => p.id) } },
        select: { blogPostId: true, createdAt: true },
      });
      const sentDates = new Map(
        campaigns.map((campaign) => [campaign.blogPostId, campaign.createdAt]),
      );
      return rows.map((post) => ({
        ...post,
        emailedAt: sentDates.get(post.id) ?? null,
      }));
    });
    return res.status(200).json(posts);
  }

  if (req.method === 'POST') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      if (!context.body)
        return res.status(422).json({ error: 'Invalid request body' });
      const { sendEmail, ...body } = context.body;
      if (sendEmail && !(await isAdmin(Number(userId))))
        return res
          .status(403)
          .json({ error: 'News email requires ADMINISTRATOR' });
      const post = await prisma.$transaction(
        async (tx) => {
          const created = await tx.blog_posts.create({
            data: {
              ...body,
              postedby_id: Number(userId),
              publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
            },
          });
          const emailResult =
            sendEmail && created.kind === 'NEWS' && body.status === 'PUBLISHED'
              ? await queueNewsEmail(tx, created, Number(userId))
              : null;
          await logActionStrict(
            {
              userId: Number(userId),
              action: 'ADMIN_POST_CREATE',
              ip: getRequestIp(req),
              details: {
                postId: created.id,
                campaignId: emailResult?.campaign.id ?? null,
              },
            },
            tx,
          );
          return { ...created, emailResult };
        },
        { timeout: 120_000 },
      );
      const { emailResult: reservedEmail, ...postData } = post;
      const emailResult = reservedEmail
        ? await releaseNewsEmail(reservedEmail, post)
        : null;
      return res.status(201).json({
        ...postData,
        emailAlreadySent: emailResult?.alreadySent ?? false,
        emailedAt: emailResult?.campaign.createdAt ?? null,
      });
    } catch (err) {
      logError('Failed to create post:', err);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
