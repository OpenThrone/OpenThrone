import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { getAttackRecommendation } from '@/services/AttackRecommendation.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const querySchema = z.object({ id: z.coerce.number().int().positive() });
const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'attack_read',
  querySchema,
});
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof querySchema> },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  const viewerId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(viewerId) || viewerId <= 0)
    return res.status(401).json({ message: 'Unauthorized' });
  try {
    return res
      .status(200)
      .json(await getAttackRecommendation(viewerId, context.query.id));
  } catch (error) {
    logError(error, {}, 'Attack recommendation unavailable');
    return res.status(503).json({ message: 'Recommendation unavailable' });
  }
}
export default guardedHandler(handler);
