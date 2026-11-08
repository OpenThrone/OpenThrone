import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { CRON_RUN_STALE_AFTER_MS } from '@/services/CronRun.service';
import type { AuthenticatedRequest } from '@/types/api';

const PAGE_SIZE = 25;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  job: z.string().min(1).max(64).optional(),
  status: z.enum(['RUNNING', 'SUCCESS', 'FAILED']).optional(),
});

/**
 * Read-only view of the scheduled-job run log (see docs/operations.md).
 * Operational diagnostics (no player data), so reads are not audit-logged.
 */
const handler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_SERVER_SETTINGS],
  rateLimitProfile: 'admin',
  querySchema,
})(async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof querySchema> },
) => {
  const q = context.query;
  const now = Date.now();
  const where = {
    ...(q.job ? { job: q.job } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [rows, total, jobGroups, lastSuccess] = await Promise.all([
    prisma.cronRun.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.cronRun.count({ where }),
    prisma.cronRun.groupBy({ by: ['job'] }),
    prisma.cronRun.findMany({
      where: { status: 'SUCCESS' },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      distinct: ['job'],
      select: {
        job: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
      },
    }),
  ]);

  return res.status(200).json({
    // A RUNNING row past the threshold lost its finish (process death or a
    // late start insert); flag it so the page does not show it as running.
    rows: rows.map((row) => ({
      ...row,
      stale:
        row.status === 'RUNNING' &&
        now - row.startedAt.getTime() > CRON_RUN_STALE_AFTER_MS,
    })),
    total,
    jobs: jobGroups.map((group) => group.job).sort(),
    lastSuccess,
  });
});

export default handler;
