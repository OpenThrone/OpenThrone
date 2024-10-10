// pages/api/recruit/startSession.ts
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = req.session;
  if (!session || !session.user || !session.user.id) {
    console.log(session)
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user.id;
  const MAX_SESSIONS_PER_USER = 2; // Limit to 1 active session per user

  // Clean up expired sessions (older than 30 minutes)
  const expirationTime = new Date(Date.now() - 30 * 60 * 1000);
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
    return res.status(429).json({ error: 'Too many active sessions' });
  }

  // Create a new session
  const newSession = await prisma.autoRecruitSession.create({
    data: { userId },
  });

  return res.status(200).json({ sessionId: newSession.id });
}

export default withAuth(handler);