import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType, ReportResolution } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { ReportService } from '@/services/Report.service';
import type { AuthenticatedRequest } from '@/types/api';

const Schema = z.object({
  resolution: z.nativeEnum(ReportResolution),
  resolutionSummary: z.string().max(2000).optional(),
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
  if (Number.isNaN(reportId))
    return res.status(400).json({ error: 'Invalid report ID' });

  try {
    const report = await ReportService.resolveReport(Number(userId), {
      reportId,
      resolution: context.body.resolution,
      resolutionSummary: context.body.resolutionSummary,
    });
    return res.status(200).json(report);
  } catch {
    return res.status(400).json({ error: 'Failed to resolve report' });
  }
}

export default guardedHandler(handler);
