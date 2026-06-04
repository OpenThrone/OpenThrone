import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ReportService } from '@/services/Report.service';
import type { AuthenticatedRequest } from '@/types/api';

const CreateSchema = z.object({
  reportedUserId: z.number().int().positive(),
  category: z.string().min(1),
  description: z.string().min(10).max(2000),
  subject: z.string().max(200).optional(),
  chatMessageId: z.number().int().positive().optional(),
  roomId: z.number().int().positive().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: CreateSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof CreateSchema> },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const report = await ReportService.createReport(
      Number(userId),
      context.body as any,
    );
    return res.status(201).json(report);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create report' });
  }
}

export default guardedHandler(handler);
