import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { AuthService } from '@/services';

const ResetSchema = z.object({
  email: z.string().email(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const validatedBody = ResetSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // handle password reset
  const { email } = validatedBody.data;
  try {
    const result = await AuthService.requestPasswordReset(email);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
