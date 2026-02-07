import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withCors } from '@/middleware/cors';
import { AuthService } from '@/services';

const ResetSchema = z.object({
  email: z.string().email(),
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const validatedBody = ResetSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // handle password reset
  const { email } = validatedBody.data;
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

export default withCors(handler, { envVar: 'OT_AUTH_CORS_ORIGINS' });
