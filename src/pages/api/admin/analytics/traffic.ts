import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  fetchGaRealtimeActiveUsers,
  fetchGaTrafficData,
  GA_SERVER_ENV_NAMES,
  GaDataError,
  getGaServerConfig,
} from '@/services/analytics/GoogleAnalyticsData.service';
import type { AuthenticatedRequest } from '@/types/api';
import { isMeasurementIdConfigured } from '@/utils/consent';
import { logError } from '@/utils/logger';
import { getOTDayKey, getOTStartDate } from '@/utils/timefunctions';

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

/** GA only counts visitors who accepted; the consent tally counts everyone. */
interface ConsentBlock {
  trend: Array<{ date: string; granted: number; denied: number }>;
  totals: { granted: number; denied: number };
  /** granted / (granted + denied); null while there are no choices. */
  optInRate: number | null;
}

async function loadConsentBlock(days: number): Promise<ConsentBlock> {
  const since = getOTStartDate(-(days - 1));
  const rows = await prisma.consentTally.findMany({
    where: { day: { gte: since } },
    select: { day: true, choice: true, count: true },
  });
  const byDay = new Map<string, { granted: number; denied: number }>();
  let granted = 0;
  let denied = 0;
  for (const row of rows) {
    // Rows are written with OT day keys (see /api/consent), so the stored
    // date's UTC calendar day is the bucket key.
    const key = row.day.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? { granted: 0, denied: 0 };
    if (row.choice === 'granted') {
      bucket.granted += row.count;
      granted += row.count;
    } else {
      bucket.denied += row.count;
      denied += row.count;
    }
    byDay.set(key, bucket);
  }
  const trend = Array.from({ length: days }, (_, offset) => {
    const key = getOTDayKey(getOTStartDate(offset, since));
    const bucket = byDay.get(key) ?? { granted: 0, denied: 0 };
    return { date: key, ...bucket };
  });
  const choices = granted + denied;
  return {
    trend,
    totals: { granted, denied },
    optInRate: choices > 0 ? granted / choices : null,
  };
}

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) {
  const { days } = context.query;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const consent = await loadConsentBlock(days);

    const serverConfigured = !!getGaServerConfig();
    const measurementConfigured = isMeasurementIdConfigured(
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim(),
    );
    // The admin page needs the Data API (server) and a valid measurement ID
    // for the setup state to make sense; list variable names, never values.
    const configured = serverConfigured && measurementConfigured;
    if (!configured) {
      return res.status(200).json({
        days,
        configured: false,
        envNames: GA_SERVER_ENV_NAMES,
        consent,
      });
    }

    try {
      const [traffic, realtimeActiveUsers] = await Promise.all([
        fetchGaTrafficData(days),
        fetchGaRealtimeActiveUsers(),
      ]);
      return res.status(200).json({
        days,
        configured: true,
        ...traffic,
        realtimeActiveUsers,
        consent,
      });
    } catch (error) {
      // One failed GA call must not hide the consent block: the page shows
      // an error alert with a retry instead.
      if (error instanceof GaDataError) {
        logError('Traffic analytics unavailable:', error.code);
        return res.status(200).json({
          days,
          configured: true,
          gaError: error.code,
          consent,
        });
      }
      throw error;
    }
  } catch (error) {
    logError('Failed to load traffic analytics:', error);
    return res.status(500).json({ error: 'Failed to load traffic analytics' });
  }
}

export default guardedHandler(handler);
