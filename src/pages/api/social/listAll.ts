import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';

const ListSocialSchema = z.object({
  type: z.enum(['FRIEND', 'ENEMY', 'REQUESTS']),
  limit: z.coerce.number().int().positive().max(100).optional(),
  playerId: z.coerce.number().int().optional(),
});

const getTopSocialRelations = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { session } = req;

  const parseResult = ListSocialSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { type, limit, playerId } = parseResult.data;
  const userId = session ? session.user.id : null;

  try {
    const result = await SocialService.listRelationships(userId, {
      type,
      limit,
      playerId,
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export default withAuth(getTopSocialRelations, true);
