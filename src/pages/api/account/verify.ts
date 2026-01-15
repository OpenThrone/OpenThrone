import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { AuthService } from '@/services';

const VerifySchema = z.object({
  email: z.string().email(),
  verify: z.string().min(1),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const validatedBody = VerifySchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // handle password reset
  const { email, verify } = validatedBody.data;
  try {
    const result = await AuthService.verifyPasswordResetCode(email, verify);
    return res.json({
      status: true,
      verified: result.verified,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
