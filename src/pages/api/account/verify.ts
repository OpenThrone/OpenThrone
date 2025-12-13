import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthService } from '@/services';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }
  // handle password reset
  const { email, verify } = req.body;
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
