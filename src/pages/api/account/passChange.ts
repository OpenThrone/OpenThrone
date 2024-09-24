import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
const argon2 = require('argon2');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }
  // handle password reset
  const { email, verify, newPassword } = req.body;
  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingReset = await prisma.passwordReset.findMany({
      where: {
        userId: user.id,
        verificationCode: verify,
        status: 0,
        createdAt: {
          gt: new Date(new Date().getTime() - 1000 * 60 * 60 * 3),
        },
        type: 'PASSWORD'
      },
    });

    console.log('existingReset', existingReset)

    if (existingReset.length === 0) {
      return res.status(404).json({ error: 'Invalid verification code' });
    }

    const phash = await argon2.hash(newPassword);

    const updatePassword = await prisma.users.update({
      where: { id: user.id },
      data: { password_hash: phash },
    });

    return res.json({
      status: true,
      passwordChanged: true
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
