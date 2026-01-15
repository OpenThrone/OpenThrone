import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { AuthService } from '@/services';
import { logError } from '@/utils/logger';

import { authOptions } from '../auth/[...nextauth]';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = parseInt(session.user.id.toString());
    const displayName = (session.user as any)?.display_name ?? 'user';

    const result = await AuthService.enable2FA(userId, displayName);

    res.status(200).json(result);
  } catch (error) {
    logError('Enable 2FA error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
