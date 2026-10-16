import type { NextApiResponse } from 'next';

import { rateLimiter } from '@/lib/rate-limiter';
import { withAuth } from '@/middleware/auth';
import { AccountService } from '@/services/Account.service';
import type { AuthenticatedRequest } from '@/types/api';

/** Sends an email-change token only to the authenticated account's address. */
export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }
  const userId = Number(req.session?.user?.id);
  const email = req.session?.user?.email;
  if (!Number.isSafeInteger(userId) || userId <= 0 || !email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    if (
      !(await rateLimiter(`email-change-request:${userId}`, {
        windowMs: 60 * 60_000,
        max: 3,
      }))
    ) {
      return res
        .status(429)
        .json({ error: 'Too many requests. Try again later.' });
    }
    await AccountService.requestEmailChange({ email }, userId);
    return res.json({ status: true, message: 'Email change request sent' });
  } catch {
    return res
      .status(500)
      .json({ status: false, error: 'Unable to request email change' });
  }
};

export default withAuth(handler);
