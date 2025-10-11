// pages/api/recruit/startSession.ts
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types/api';

const handler = async (req: AuthenticatedRequest, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_FOUND' });
  }
  let userId = 0;
  const session = req.session;
  if (session) {
    userId = session.user.id;
  }

  const MAX_SESSIONS_PER_USER = 2; // Limit to 1 active session per user

  const expirationTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

  const newSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Expire old sessions
    await tx.autoRecruitSession.deleteMany({
      where: {
        userId: userId,
        lastActivityAt: { lt: expirationTime },
      },
    });

    // Count active sessions (lastActivityAt >= expirationTime)
    const activeSessions = await tx.autoRecruitSession.count({
      where: {
        userId: userId,
        lastActivityAt: { gte: expirationTime },
      },
    });

    if (activeSessions >= MAX_SESSIONS_PER_USER) {
      throw new Error('Too many active sessions');
    }

    // Create a new session
    return await tx.autoRecruitSession.create({
      data: {
        userId: userId,
      },
    });
  });

  return res.status(200).json({ sessionId: newSession.id });
}

export default withAuth(handler, true);