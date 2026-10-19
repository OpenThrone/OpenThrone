import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import {
  disableTwoFactor,
  TwoFactorSetupError,
} from '@/services/TwoFactor.service';
import {
  consumeRateLimit,
  TWO_FACTOR_DISABLE_LIMIT,
} from '@/utils/credentialGuards';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

import { authOptions } from '../auth/[...nextauth]';

const DisableTwoFactorSchema = z
  .object({
    password: z.string().min(1).max(1024).optional(),
    totpCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .refine((body) => Boolean(body.password || body.totpCode), {
    message: 'Password or 2FA code is required',
  });

/** Handles account disable 2FA API requests. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = parseInt(session.user.id.toString(), 10);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = DisableTwoFactorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Password or 2FA code is required',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const allowed = await consumeRateLimit(
      `disable2fa:${userId}`,
      TWO_FACTOR_DISABLE_LIMIT,
    );
    if (!allowed) {
      return res.status(429).json({ error: 'Too many attempts. Try later.' });
    }

    const result = await disableTwoFactor(userId, parsed.data);

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof TwoFactorSetupError)
      return res
        .status(error.status)
        .json({ error: publicErrorMessage(error) });
    logError('Disable 2FA error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
