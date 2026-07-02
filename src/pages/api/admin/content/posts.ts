import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const Schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  excerpt: z.string().max(500).optional(),
  slug: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  kind: z.enum(['BLOG', 'NEWS', 'CHANGELOG']).default('BLOG'),
  isPinned: z.boolean().default(false),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_CONTENT],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof Schema> },
) {
  if (req.method === 'GET') {
    const posts = await prisma.blog_posts.findMany({
      orderBy: { created_timestamp: 'desc' },
      include: { postedBy: { select: { id: true, display_name: true } } },
    });
    return res.status(200).json(posts);
  }

  if (req.method === 'POST') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const post = await prisma.blog_posts.create({
        data: {
          ...context.body!,
          postedby_id: Number(userId),
          publishedAt: context.body!.status === 'PUBLISHED' ? new Date() : null,
        },
      });
      return res.status(201).json(post);
    } catch (err) {
      logError('Failed to create post:', err);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
