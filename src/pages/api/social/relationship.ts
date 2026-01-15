import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

const GetRelationshipSchema = z.object({
  userId: z.coerce.number().int(),
  targetUserId: z.coerce.number().int(),
});

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session } = req;
  if (!session) {
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

  try {
    const result = await SocialService.getRelationship(userId, {
      userId,
      targetUserId,
    });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error fetching relationship:', error);
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(handler);
