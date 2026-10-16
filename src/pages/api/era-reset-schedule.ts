import type { NextApiRequest, NextApiResponse } from 'next';

import { getEraResetSchedule } from '@/services/EraResetSchedule.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    return res.status(200).json(await getEraResetSchedule());
  } catch {
    return res.status(503).json({ error: 'Era reset schedule unavailable' });
  }
}
