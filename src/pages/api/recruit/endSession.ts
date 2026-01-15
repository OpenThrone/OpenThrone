// pages/api/recruit/endSession.ts
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { endSession } from '@/services/Sessions.service';

const EndSessionSchema = z.object({
  sessionId: z.number().int(),
});

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_FOUND' });
  }

  const validatedBody = EndSessionSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { session } = req;
  if (!session || !session.user || !session.user.id) {
    return res
      .status(401)
      .json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  const userId = session.user.id;
  const { sessionId } = validatedBody.data;

  // Delete the session
  await endSession(userId, sessionId);

  return res.status(200).json({ message: 'Session ended' });
};

export default withAuth(handler);
