import type { NextApiRequest, NextApiResponse } from 'next';

import { getPublicEraTabs } from '@/services/UserEraStats.service';
import { logError } from '@/utils/logger';

/** Returns the public list of era tabs (current + past eras). */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const eras = await getPublicEraTabs();
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    return res.status(200).json({ eras });
  } catch (error) {
    logError('Failed to load era tabs', error);
    return res.status(500).json({ error: 'Failed to load eras' });
  }
}
