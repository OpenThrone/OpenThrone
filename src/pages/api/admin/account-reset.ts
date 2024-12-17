import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSession } from 'next-auth/react';
import { isAdmin } from '@/utils/authorization';
import { withAuth } from '@/middleware/auth';

export const handler = async(req: NextApiRequest, res: NextApiResponse) => {
  const session = req?.session;
  if (!session || !session.user || !(await isAdmin(session.user.id))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, reason } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    // Fetch the user's current data
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create a new user account (simulate reset)
    const newUser = await prisma.users.create({
      data: {
        email: user.email,
        password_hash: user.password_hash,
        display_name: user.display_name,
        // Reset other fields to default values
        race: user.race,
        class: user.class,
        // Set other necessary default values...
      },
    });

    // Log the reset in AccountResetHistory
    await prisma.accountResetHistory.create({
      data: {
        userId: userId,
        resetDate: new Date(),
        newUserId: newUser.id,
        reason: reason || 'Account reset by admin',
      },
    });

    // Optionally, set the old user's status to CLOSED
    await prisma.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: 'CLOSED',
        start_date: new Date(),
        reason: 'Account reset and closed by admin',
        admin_id: session.user.id,
      },
    });

    res.status(200).json({ message: 'Account has been reset', newUserId: newUser.id });
  } catch (error) {
    console.error('Error resetting account:', error);
    res.status(500).json({ error: 'Failed to reset account' });
  }
}

export default withAuth(handler);