// src/pages/api/account/end-vacation.ts
import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services/Account.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

/**
 * Handles account end vacation API requests for the session owner only.
 * Signed-out players end vacation at sign-in instead: the login form resends
 * their credentials with `endVacation`, and the credentials provider ends it
 * only after captcha, password and TOTP verify (see [...nextauth].ts).
 */
const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // The acting account comes from the session only; any body userId is ignored.
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await AccountService.endVacation(userId);
    res.status(200).json(result);
  } catch (error) {
    logError(error);
    res.status(500).json({ error: 'Failed to end vacation mode' });
  }
};

export default withAuth(handler, {
  allowVacation: true,
  rateLimitProfile: 'game_write',
});
