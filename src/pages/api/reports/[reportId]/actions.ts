import type { NextApiResponse } from 'next';
import { z } from 'zod';

import {
  PermissionType,
  ReportPriority,
  ReportStatus,
} from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ReportService } from '@/services/Report.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z
  .object({
    type: z.enum(['NOTE_ADDED', 'STATUS_CHANGED', 'PRIORITY_CHANGED']),
    body: z.string().max(2000).optional(),
    toStatus: z.nativeEnum(ReportStatus).optional(),
    toPriority: z.nativeEnum(ReportPriority).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'STATUS_CHANGED' && !data.toStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toStatus'],
        message: 'New status is required for status changes.',
      });
    }

    if (data.type === 'PRIORITY_CHANGED' && !data.toPriority) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toPriority'],
        message: 'New priority is required for priority changes.',
      });
    }
  });

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.REVIEW_REPORTS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown; body: z.infer<typeof Schema> },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const reportId = Number((context.query as { reportId: string }).reportId);
  if (Number.isNaN(reportId)) {
    return res.status(400).json({ error: 'Invalid report ID' });
  }

  try {
    const action = await ReportService.addAction(Number(userId), {
      reportId,
      type: context.body.type,
      body: context.body.body,
      toStatus: context.body.toStatus,
      toPriority: context.body.toPriority,
    });

    return res.status(200).json(action);
  } catch {
    return res.status(400).json({ error: 'Failed to add report action' });
  }
}

export default guardedHandler(handler);
