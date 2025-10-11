import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types/api';
import { validateSession } from '@/services/sessions.service';
import { z } from 'zod';

const BodySchema = z.object({
  sessionId: z.union([z.string(), z.number()]).optional(),
});

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.session;
  const userId = session ? session.user.id : 0;

  try {
    const data = BodySchema.parse(req.body || {});
    const sessionIdRaw = data.sessionId;
    if (!sessionIdRaw) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    const sessionId = typeof sessionIdRaw === 'string' ? parseInt(sessionIdRaw, 10) : Number(sessionIdRaw);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const valid = await validateSession(userId, sessionId);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid recruitment link.' });
    }

    return res.status(200).json({ valid: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.format() });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
};

export default withAuth(handler, true);
