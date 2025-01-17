// pages/api/recruit/startSession.ts
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { countSessions, createSession, expireOldSessions } from '@/services/sessions.service';

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_FOUND' });
  }
  let userId = 0;
  const session = req.session;
  if (session) {
    userId = session.user.id;
  }

  const MAX_SESSIONS_PER_USER = 2; // Limit to 1 active session per user

  await expireOldSessions(userId);

  // Count active sessions
  const activeSessions = await countSessions(userId);

  if (activeSessions >= MAX_SESSIONS_PER_USER) {
    return res.status(429).json({ error: 'Too many active sessions', code: 'TOO_MANY_SESSIONS' });
  }

  // Create a new session
  const newSession = await createSession(userId);
  
  return res.status(200).json({ sessionId: newSession.id });
}

export default withAuth(handler, true);