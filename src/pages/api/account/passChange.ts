import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withCors } from '@/middleware/cors';
import { AccountService } from '@/services';
import { publicErrorMessage } from '@/utils/publicError';

// Logged-out recovery flow: the emailed reset token is the only credential.
const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'none',
  rateLimitProfile: 'password_reset',
});

/** Errors from AccountService.resetPasswordWithCode that are the caller's, not ours. */
const INVALID_CODE_ERRORS = new Set([
  'Invalid verification code',
  'User not found',
]);
const TOO_MANY_ATTEMPTS = 'Too many verification attempts. Request a new code.';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const PassChangeSchema = z.object({
    email: z.string().email({ message: 'Invalid email format.' }),
    verify: z.string().min(1),
    newPassword: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters.' }),
  });
  const parseResult = PassChangeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { email, verify, newPassword } = parseResult.data;

  try {
    const result = await AccountService.resetPasswordWithCode({
      email,
      verificationCode: verify,
      newPassword,
    });

    return res.json(result);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : '';
    // A wrong or used code and an unknown address get the same answer as
    // /api/account/verify, so the response does not reveal which accounts
    // exist. Only genuine faults are a 500.
    if (INVALID_CODE_ERRORS.has(message)) {
      return res.status(400).json({
        status: false,
        error: 'Invalid or expired verification code',
      });
    }
    if (message === TOO_MANY_ATTEMPTS) {
      return res.status(429).json({ status: false, error: TOO_MANY_ATTEMPTS });
    }
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: publicErrorMessage(error),
    });
  }
}

export default withCors(guardedHandler(handler), {
  envVar: 'OT_AUTH_CORS_ORIGINS',
});
