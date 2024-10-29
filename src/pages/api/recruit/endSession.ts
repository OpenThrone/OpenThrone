// pages/api/recruit/endSession.ts
import { withAuth } from '@/middleware/auth';
import { endSession } from '@/services/sessions.service';

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_FOUND' });
  }
  const session = req.session;
  if (!session || !session.user || !session.user.id) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  const userId = session.user.id;
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required', code: 'SESSION_ID_REQ' });
  }

  // Delete the session
  await endSession(userId, sessionId);

  return res.status(200).json({ message: 'Session ended' });
}

export default withAuth(handler);