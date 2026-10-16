import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { getInvestigationSignals } from '@/services/InvestigationSignals.service';
import type { AuthenticatedRequest } from '@/types/api';
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
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    return res
      .status(200)
      .json(await getInvestigationSignals(context.query.days));
  } catch (error) {
    logError('Failed to compute read-only investigation signals', error);
    return res.status(500).json({
      error:
        'Could not compute investigation signals. Retry with the 7-day window.',
    });
  }
}
export default guard(handler);
