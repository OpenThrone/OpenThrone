import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma'; // Adjust based on your Prisma setup
import { getSession } from 'next-auth/react';
import { withAuth } from '@/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, userId, displayName } = req.body;
    const session = req.session;

    if (!session || (!email && !userId && !displayName)) {
      return res.status(401).json({ error: 'Unauthorized or missing parameters' });
    }

    const updatedUser = await prisma.users.update({
      where: email ? { email } : userId ? { id: userId } : { display_name: displayName },
      data: { last_active: new Date() },
    });

    return res.status(200).json({ message: 'Last active timestamp updated', user: updatedUser.id });
  } catch (error) {
    console.error('Error updating last active:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler);