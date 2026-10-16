import type { NextApiRequest, NextApiResponse } from 'next';

import { getRuntimeConfig } from '@/services/RuntimeConfig.service';

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await getRuntimeConfig());
  } catch {
    return res.status(503).json({ error: 'Runtime configuration unavailable' });
  }
}
