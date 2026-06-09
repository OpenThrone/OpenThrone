import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  excerpt: z.string().max(500).optional(),
  slug: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  kind: z.enum(['BLOG', 'NEWS', 'CHANGELOG']).optional(),
  isPinned: z.boolean().optional(),
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
      const { body } = context;
      const publishedAt = body.status === 'PUBLISHED' ? new Date() : undefined;
      const post = await prisma.blog_posts.update({
        where: { id },
        data: {
          ...body,
          ...(publishedAt && !body.status
            ? {}
            : publishedAt
              ? { publishedAt }
              : {}),
        },
        include: { postedBy: { select: { id: true, display_name: true } } },
      });
      return res.status(200).json(post);
    } catch (err) {
      logError('Failed to update post:', err);
      return res.status(500).json({ error: 'Failed to update post' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.blog_posts.delete({ where: { id } });
      return res.status(200).json({ success: true });
    } catch (err) {
      logError('Failed to delete post:', err);
      return res.status(500).json({ error: 'Failed to delete post' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
