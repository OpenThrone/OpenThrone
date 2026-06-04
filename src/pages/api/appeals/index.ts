import { PermissionType } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';

const CreateSchema = z.object({
  accountStatusHistoryId: z.number().int().positive(),
  subject: z.string().max(200).optional(),
  body: z.string().min(10).max(5000),
});

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'required',
  rateLimitProfile: 'admin',
  bodySchema: CreateSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body?: z.infer<typeof CreateSchema>; query: { status?: string } },
) {
  if (req.method === 'GET') {
    const appeals = await ModerationService.listBanAppeals();
    return res.status(200).json(appeals);
  }

  if (req.method === 'POST') {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const appeal = await ModerationService.createBanAppeal(Number(userId), context.body!);
    return res.status(201).json(appeal);
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
