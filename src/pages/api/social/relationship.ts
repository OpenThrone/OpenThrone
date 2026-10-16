import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

// The subject is always the signed-in player; only their own relationship to
// another player can be read. A legacy userId is accepted only if it matches.
const GetRelationshipSchema = z
  .object({
    userId: z.coerce.number().int().positive().optional(),
    targetUserId: z.coerce.number().int().positive(),
  })
  .strict();

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionUserId = Number(req.session?.user?.id);
  if (
    !req.session ||
    !Number.isSafeInteger(sessionUserId) ||
    sessionUserId <= 0
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = GetRelationshipSchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request parameters',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { userId, targetUserId } = parseResult.data;
  if (userId !== undefined && userId !== sessionUserId) {
    return res
      .status(403)
      .json({ error: 'Forbidden: Cannot check relationship for another user' });
  }

  try {
    const result = await SocialService.getRelationship(sessionUserId, {
      userId: sessionUserId,
      targetUserId,
    });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error fetching relationship:', error);
    return res.status(400).json({ error: 'Unable to load relationship.' });
  }
};

export default withAuth(handler);
