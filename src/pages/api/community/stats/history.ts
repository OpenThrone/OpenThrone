import type { NextApiRequest, NextApiResponse } from 'next';

import { getCached, setCached } from '@/lib/postgres-rate-limiter';
import {
  getHistoricalEraStats,
  type HistoricalEraStatsPayload,
} from '@/services/UserEraStats.service';
import { logError } from '@/utils/logger';

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

/** Returns the full historical stats payload for a single past era. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = Array.isArray(req.query.eraId)
    ? req.query.eraId[0]
    : req.query.eraId;
  if (!raw) {
    return res.status(400).json({ error: 'Invalid or missing eraId' });
  }
  const parsedEraId = Number(raw);
  if (!Number.isInteger(parsedEraId) || parsedEraId <= 0) {
    return res.status(400).json({ error: 'Invalid or missing eraId' });
  }

  const cacheKey = `community:stats:history:era:${parsedEraId}:v1`;

  try {
    const cached = await getCached<HistoricalEraStatsPayload>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', CACHE_CONTROL);
      return res.status(200).json(cached);
    }

    const payload = await getHistoricalEraStats(parsedEraId);
    if (!payload) {
      // Era not found or still active — do not cache a 404.
      return res.status(404).json({ error: 'Era not found' });
    }

    await setCached(cacheKey, payload, CACHE_TTL_MS);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    return res.status(200).json(payload);
  } catch (error) {
    logError('Failed to load historical era stats', error);
    return res
      .status(500)
      .json({ error: 'Failed to load historical era stats' });
  }
}
