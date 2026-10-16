import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';

// Only the signed-in player's own relationships are listed. Unknown fields such
// as playerId are rejected rather than stripped, so a caller asking for another
// player's list gets an error instead of silently receiving its own.
const ListSocialSchema = z
  .object({
    type: z.enum(['FRIEND', 'ENEMY', 'REQUESTS']),
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

const getTopSocialRelations = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const userId = Number(req.session?.user?.id);
  if (!req.session || !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = ListSocialSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { type, limit } = parseResult.data;

  try {
    const result = await SocialService.listRelationships(userId, {
      type,
      limit,
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export default withAuth(getTopSocialRelations);
