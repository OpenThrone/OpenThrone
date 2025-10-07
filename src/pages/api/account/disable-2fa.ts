import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      return res.status(400).json({ error: '2FA not enabled' });
    }

    await prisma.users.update({
      where: { id: userId },
      data: { twoFactorSecret: null },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    logError('Disable 2FA error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}