import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withCors } from '@/middleware/cors';
import { AuthService } from '@/services';

const ResetSchema = z.object({
  email: z.string().email(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'none',
  rateLimitProfile: 'password_reset',
  bodySchema: ResetSchema,
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { email } = ResetSchema.parse(req.body);
  try {
    await AuthService.requestPasswordReset(email);
    return res.status(200).json({
      status: true,
      message: 'If the account exists, a password reset email has been sent.',
    });
  } catch {
    return res.status(200).json({
      status: true,
      message: 'If the account exists, a password reset email has been sent.',
    });
  }
}

export default withCors(guardedHandler(handler), {
  envVar: 'OT_AUTH_CORS_ORIGINS',
});
