import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ReportService } from '@/services/Report.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({
  assignedToUserId: z.number().int().positive().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.ASSIGN_REPORTS],
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
  if (Number.isNaN(reportId))
    return res.status(400).json({ error: 'Invalid report ID' });

  try {
    const report = await ReportService.assignReport(Number(userId), {
      reportId,
      assignedToUserId: context.body.assignedToUserId,
    });
    return res.status(200).json(report);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to assign report' });
  }
}

export default guardedHandler(handler);
