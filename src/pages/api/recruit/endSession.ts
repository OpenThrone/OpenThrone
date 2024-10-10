// pages/api/recruit/endSession.ts
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getSession } from 'next-auth/react';

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = req.session;
  if (!session || !session.user || !session.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user.id;
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  // Delete the session
  await prisma.autoRecruitSession.deleteMany({
    where: { id: sessionId, userId },
  });

  return res.status(200).json({ message: 'Session ended' });
}

export default withAuth(handler);