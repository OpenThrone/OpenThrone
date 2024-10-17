// pages/api/recruit/startSession.ts
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';

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

  // Clean up expired sessions (older than 5 minutes)
  const expirationTime = new Date(Date.now() - 5 * 60 * 1000);
  await prisma.autoRecruitSession.deleteMany({
    where: {
      userId,
      lastActivityAt: { lt: expirationTime },
    },
  });

  // Count active sessions
  const activeSessions = await prisma.autoRecruitSession.count({
    where: { userId },
  });

  if (activeSessions >= MAX_SESSIONS_PER_USER) {
    return res.status(429).json({ error: 'Too many active sessions', code: 'TOO_MANY_SESSIONS' });
  }

  // Create a new session
  const newSession = await prisma.autoRecruitSession.create({
    data: { userId },
  });

  return res.status(200).json({ sessionId: newSession.id });
}

export default withAuth(handler, true);