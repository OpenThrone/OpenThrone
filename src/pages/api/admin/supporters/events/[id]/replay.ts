import type { NextApiResponse } from 'next';

import { supporterGuard } from '@/services/supporter/admin';
import { replay } from '@/services/supporter/PaymentEvents.service';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({ error: 'Invalid event' });
  try {
    const result = await replay(id);
    return res.json(result.event);
  } catch {
    return res.status(400).json({ error: 'Event could not be replayed' });
  }
}
export default supporterGuard(['POST'])(handler);
