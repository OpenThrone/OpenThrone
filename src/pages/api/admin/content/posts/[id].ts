import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  queueNewsEmail,
  releaseNewsEmail,
} from '@/services/AdminEmail.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { isAdmin } from '@/utils/authorization';
import { logError } from '@/utils/logger';

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  excerpt: z.string().max(500).optional(),
  slug: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  kind: z.enum(['BLOG', 'NEWS', 'CHANGELOG']).optional(),
  isPinned: z.boolean().optional(),
  sendEmail: z.boolean().default(false),
});

const guardedHandler = withApiGuard({
  methods: ['PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_CONTENT],
  rateLimitProfile: 'admin',
  bodySchema: UpdateSchema,
});

export async function handler(
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
      const { sendEmail, ...body } = context.body;
      if (sendEmail && !(await isAdmin(Number(userId))))
        return res
          .status(403)
          .json({ error: 'News email requires ADMINISTRATOR' });
      const post = await prisma.$transaction(
        async (tx) => {
          const updated = await tx.blog_posts.update({
            where: { id },
            data: {
              ...body,
              ...(body.status === 'PUBLISHED'
                ? { publishedAt: new Date() }
                : {}),
            },
            include: { postedBy: { select: { id: true, display_name: true } } },
          });
          const emailResult =
            sendEmail && updated.kind === 'NEWS' && body.status === 'PUBLISHED'
              ? await queueNewsEmail(tx, updated, Number(userId))
              : null;
          await logActionStrict(
            {
              userId: Number(userId),
              action: 'ADMIN_POST_UPDATE',
              ip: getRequestIp(req),
              details: {
                postId: updated.id,
                campaignId: emailResult?.campaign.id ?? null,
                status: body.status ?? null,
                emailAlreadySent: emailResult?.alreadySent ?? false,
              },
            },
            tx,
          );
          return { ...updated, emailResult };
        },
        { timeout: 120_000 },
      );
      const { emailResult: reservedEmail, ...postData } = post;
      const emailResult = reservedEmail
        ? await releaseNewsEmail(reservedEmail, post)
        : null;
      return res.status(200).json({
        ...postData,
        emailAlreadySent: emailResult?.alreadySent ?? false,
        emailedAt: emailResult?.campaign.createdAt ?? null,
      });
    } catch (err) {
      logError('Failed to update post:', err);
      return res.status(500).json({ error: 'Failed to update post' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.blog_posts.delete({ where: { id } });
        await logActionStrict(
          {
            userId: Number(userId),
            action: 'ADMIN_POST_DELETE',
            ip: getRequestIp(req),
            details: { postId: id },
          },
          tx,
        );
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      logError('Failed to delete post:', err);
      return res.status(500).json({ error: 'Failed to delete post' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
