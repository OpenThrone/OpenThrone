import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import speakeasy from 'speakeasy';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

import { authOptions } from '../auth/[...nextauth]';

const Verify2faSchema = z.object({
  token: z.string().min(6).max(6),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validatedBody = Verify2faSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { token } = validatedBody.data;

    const userId = session.user.id;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      return res.status(400).json({ error: '2FA not enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Optionally, mark 2FA as verified in session or DB if needed
    res.status(200).json({ success: true });
  } catch (error) {
    logError('Verify 2FA error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
