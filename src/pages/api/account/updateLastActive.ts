import { NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import type { AuthenticatedRequest } from '@/types/api';
import { AccountService } from '@/services';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, userId, displayName } = req.body;
    const session = req.session;

    if (!session || (!email && !userId && !displayName)) {
      return res.status(401).json({ error: 'Unauthorized or missing parameters' });
    }

    const result = await AccountService.updateLastActive({ email, userId, displayName });

    return res.status(200).json(result);
  } catch (error) {
    logError('Error updating last active:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler);