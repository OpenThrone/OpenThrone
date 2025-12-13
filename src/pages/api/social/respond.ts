import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { NextApiResponse } from 'next';
import { SocialService } from '@/services/Social.service';
import type { AuthenticatedRequest } from '@/types/api';
import { z } from 'zod';

const RespondSchema = z.object({
  requestId: z.number().int(),
  action: z.enum(['accept', 'decline']),
});

const handler = async (req: AuthenticatedRequest,
  res: NextApiResponse,) => {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parseResult = RespondSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors
    });
  }

  const { requestId, action } = parseResult.data;
  const userId = session.user.id;

  try {
    const result = await SocialService.respondToRequest(userId, { requestId, action });

    return res.status(200).json(result);
  } catch (error) {
    logError("Error processing friend request:", error);
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(handler);