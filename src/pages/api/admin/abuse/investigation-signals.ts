import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { getInvestigationSignals } from '@/services/InvestigationSignals.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const QuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => [7, 30].includes(value))
    .default(7),
});
const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_CHEAT_SIGNALS],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
});
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  let report: Awaited<ReturnType<typeof getInvestigationSignals>>;
  try {
    report = await getInvestigationSignals(context.query.days);
  } catch (error) {
    logError('Failed to compute read-only investigation signals', error);
    return res.status(500).json({
      error:
        'Could not compute investigation signals. Retry with the 7-day window.',
    });
  }
  // Fail closed: the findings name players, so they are returned only on record.
  await logActionStrict({
    userId: Number(req.session?.user?.id),
    action: 'ADMIN_INVESTIGATION_SIGNALS_READ',
    ip: getRequestIp(req),
    details: {
      days: context.query.days,
      resultCount: report.findings.length,
    },
  });
  return res.status(200).json(report);
}
export default guard(handler);
