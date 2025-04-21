// pages/api/recruit/listSessions.ts
import { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { listSessions } from '@/services/sessions.service';
import type { AuthenticatedRequest } from '@/types/api';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { session } = req;
  const userId = session?.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sessions = await listSessions(userId);

  return res.status(200).json({ sessions });
};

export default withAuth(handler);