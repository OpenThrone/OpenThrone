import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import {
  getOTDayKey,
  getOTStartDate,
  OT_TIME_ZONE,
} from '@/utils/timefunctions';

const QuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => [7, 30, 90].includes(value), 'Days must be 7, 30, or 90')
    .default(30),
});
const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.VIEW_ANALYTICS],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
});

interface DailyCount {
  day: Date | string;
  count: bigint | number;
}

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  try {
    const { days } = context.query;
    // Buckets follow the OT calendar day.
    const since = getOTStartDate(-(days - 1));
    const zone = OT_TIME_ZONE;
    const [registrations, activity, attacks] = await Promise.all([
      prisma.$queryRaw<
        DailyCount[]
      >`SELECT (created_at AT TIME ZONE ${zone})::date::text AS day, COUNT(*)::bigint AS count FROM users WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<
        DailyCount[]
      >`SELECT (last_active AT TIME ZONE ${zone})::date::text AS day, COUNT(*)::bigint AS count FROM users WHERE last_active >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<
        DailyCount[]
      >`SELECT (timestamp AT TIME ZONE ${zone})::date::text AS day, COUNT(*)::bigint AS count FROM attack_log WHERE timestamp >= ${since} GROUP BY 1 ORDER BY 1`,
    ]);

    const index = (rows: DailyCount[]) =>
      new Map(
        rows.map((row) => [String(row.day).slice(0, 10), Number(row.count)]),
      );
    const registrationByDay = index(registrations);
    const activeByDay = index(activity);
    const attacksByDay = index(attacks);
    const trend = Array.from({ length: days }, (_, offset) => {
      const key = getOTDayKey(getOTStartDate(offset, since));
      return {
        date: key,
        registrations: registrationByDay.get(key) ?? 0,
        activePlayers: activeByDay.get(key) ?? 0,
        attacks: attacksByDay.get(key) ?? 0,
      };
    });
    const totals = trend.reduce(
      (acc, item) => ({
        registrations: acc.registrations + item.registrations,
        activePlayers: item.activePlayers,
        attacks: acc.attacks + item.attacks,
      }),
      { registrations: 0, activePlayers: 0, attacks: 0 },
    );
    return res.status(200).json({ days, totals, trend });
  } catch (error) {
    logError('Failed to load analytics:', error);
    return res.status(500).json({ error: 'Failed to load analytics' });
  }
}

export default guardedHandler(handler);
