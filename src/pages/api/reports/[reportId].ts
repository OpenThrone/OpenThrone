import type { NextApiResponse } from 'next';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ReportService } from '@/services/Report.service';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.REVIEW_REPORTS],
  rateLimitProfile: 'admin',
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: unknown },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const reportId = Number((context.query as { reportId: string }).reportId);
  if (Number.isNaN(reportId))
    return res.status(400).json({ error: 'Invalid report ID' });

  const report = await ReportService.getReport(Number(userId), reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  return res.status(200).json(report);
}

export default guardedHandler(handler);
