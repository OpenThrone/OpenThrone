// pages/api/recruit/listSessions.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { session } = req;
  const userId = session?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sessions = await prisma.autoRecruitSession.findMany({
    where: { userId: Number(userId) },
    select: {
      id: true,
      createdAt: true,
      lastActivityAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json({ sessions });
};

export default withAuth(handler);