import { PermissionType, ReportCategory, ReportPriority, ReportStatus } from '@prisma/client';
import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ReportService } from '@/services/Report.service';
import type { AuthenticatedRequest } from '@/types/api';

const ListSchema = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
  category: z.nativeEnum(ReportCategory).optional(),
  priority: z.nativeEnum(ReportPriority).optional(),
  assignedToUserId: z.coerce.number().int().optional(),
  reportedUserId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.REVIEW_REPORTS],
  rateLimitProfile: 'admin',
  querySchema: ListSchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query?: z.infer<typeof ListSchema> },
) {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await ReportService.listReports(
      Number(userId),
      context.query ?? {},
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list reports' });
  }
}

export default guardedHandler(handler);
