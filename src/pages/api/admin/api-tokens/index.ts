import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { ApiTokenService } from '@/services/ApiToken.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const IssueApiTokenSchema = z.object({
  name: z.string().min(3),
  ownerUserId: z.number().int().positive().optional(),
  clientType: z.enum(['USER', 'SYSTEM', 'SERVICE']).optional(),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime().optional(),
});

const guardedGet = withApiGuard({
  methods: ['GET'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
});

const guardedPost = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: IssueApiTokenSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context?: any,
) {
  if (req.method === 'GET') {
    try {
      const tokens = await prisma.apiToken.findMany({
        include: {
          client: {
            select: {
              id: true,
              name: true,
              clientType: true,
              status: true,
              ownerUserId: true,
              lastUsedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json({ tokens });
    } catch (error) {
      logError('Failed listing api tokens', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = context.body as z.infer<typeof IssueApiTokenSchema>;
      const issued = await ApiTokenService.issueToken({
        name: body.name,
        ownerUserId: body.ownerUserId,
        clientType: body.clientType,
        scopes: body.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });
      return res.status(201).json(issued);
    } catch (error) {
      logError('Failed issuing api token', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ message: 'Method not allowed' });
}

export default async function routed(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    return guardedGet(handler)(req, res);
  }
  if (req.method === 'POST') {
    return guardedPost(handler)(req, res);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ message: 'Method not allowed' });
}
