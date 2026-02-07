import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withCors } from '@/middleware/cors';
import { AuthService } from '@/services';

const VerifySchema = z.object({
  email: z.string().email(),
  verify: z.string().min(1),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'none',
  rateLimitProfile: 'password_reset',
  bodySchema: VerifySchema,
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { email, verify } = VerifySchema.parse(req.body);
  try {
    const result = await AuthService.verifyPasswordResetCode(email, verify);
    return res.json({
      status: true,
      verified: result.verified,
    });
  } catch {
    return res.status(400).json({
      status: false,
      error: 'Invalid or expired verification code',
    });
  }
}

export default withCors(guardedHandler(handler), {
  envVar: 'OT_AUTH_CORS_ORIGINS',
});
