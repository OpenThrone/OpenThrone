import type { NextApiRequest, NextApiResponse } from 'next';

import { getRunningGameEvents } from '@/services/GameEventRuntime.service';

/** Running game events for the player banner and price previews (#86). */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const events = await getRunningGameEvents();
  return res.status(200).json({
    events: events.map((event) => ({
      id: event.id,
      name: event.name,
      description: event.description,
      endsAt: event.endsAt?.toISOString() ?? null,
      eraBound: event.eraBound,
      effects: event.effects,
    })),
  });
}
