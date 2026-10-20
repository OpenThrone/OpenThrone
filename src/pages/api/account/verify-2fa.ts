import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { authOptions } from '@/pages/api/auth/[...nextauth]';
import {
  completeTwoFactorSetup,
  TwoFactorSetupError,
} from '@/services/TwoFactor.service';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const Verify2faSchema = z.object({
  token: z.string().regex(/^\d{6}$/),
  setupToken: z.string().min(1).max(2048),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const validated = Verify2faSchema.safeParse(req.body);
  if (!validated.success)
    return res.status(400).json({ error: 'Invalid setup or code' });
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id)
      return res.status(401).json({ error: 'Unauthorized' });
    const result = await completeTwoFactorSetup(
      Number(session.user.id),
      validated.data.token,
      validated.data.setupToken,
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof TwoFactorSetupError)
      return res
        .status(error.status)
        .json({ error: publicErrorMessage(error) });
    logError('Verify 2FA error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
