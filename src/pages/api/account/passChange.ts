import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withCors } from '@/middleware/cors';
import { AccountService } from '@/services';

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
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

export default withCors(handler, { envVar: 'OT_AUTH_CORS_ORIGINS' });
