import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { rateLimiter } from '@/lib/rate-limiter';
import { withAuth } from '@/middleware/auth';
import {
  VeteranClaimRefused,
  VeteranClaimService,
} from '@/services/VeteranClaim.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getIpAddress } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';

const ResendBody = z.object({ action: z.literal('resend') });
const ClaimBody = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  displayName: z.string().trim().max(64).optional(),
});

const REFUSALS = {
  INVALID_LINK: [400, 'This link is invalid or has expired.'],
  NOTHING_TO_CLAIM: [409, 'There is nothing left to claim for this account.'],
  NAME_MISMATCH: [422, 'That is not the display name of your earlier account.'],
  NAME_TAKEN: [409, 'That display name is already in use.'],
} as const;

/**
 * Era 1 veteran claim for the signed-in account. { action: 'resend' }
 * emails a fresh link to the account's own address; { token, displayName? }
 * redeems a link.
 */
export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (ResendBody.safeParse(req.body).success) {
      if (
        !(await rateLimiter(`veteran-claim-resend:${userId}`, {
          windowMs: 60 * 60_000,
          max: 3,
        }))
      ) {
        return res
          .status(429)
          .json({ error: 'Too many requests. Try again later.' });
      }
      const sent = await VeteranClaimService.sendClaimLink(userId);
      return res.json({ sent });
    }

    const parsed = ClaimBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    if (
      !(await rateLimiter(`veteran-claim:${userId}`, {
        windowMs: 60 * 60_000,
        max: 10,
      }))
    ) {
      return res
        .status(429)
        .json({ error: 'Too many attempts. Try again later.' });
    }
    const result = await VeteranClaimService.claim(
      userId,
      parsed.data.token,
      parsed.data.displayName || undefined,
      getIpAddress(req),
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof VeteranClaimRefused) {
      const [status, message] = REFUSALS[error.code];
      return res.status(status).json({ error: message, code: error.code });
    }
    logError('Veteran claim failed', { userId, error });
    return res.status(500).json({ error: 'Unable to complete the claim.' });
  }
};

export default withAuth(handler);
