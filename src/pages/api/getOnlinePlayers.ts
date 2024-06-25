import type { NextApiRequest, NextApiResponse } from 'next';
import { stringifyObj } from '@/utils/numberFormatting';
import { withAuth } from '@/middleware/auth';
import prisma from '@/lib/prisma';
import src from '@tiptap/extension-link';
import pages from '..';
import getUser from './getUser';

const getOnlinePlayers = async (req: NextApiRequest, res: NextApiResponse) => {

  try {
    const session = req.session;
    if (!session) {
      res.status(401).json({ error: 'Not Authorized - No session' });
      return;
    }
    // Fetch the user based on the session's user ID
    const user = await prisma.users.findUnique({
      where: {
        id: typeof(session.user.id) === 'string' ? parseInt(session.user.id) : session.user.id,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Not Authorized - Account not found' });
      return;
    }

    const allUsersCounted = await prisma.users.count({ where: { NOT: { id: 0 } } });
    const onlineUsers = await prisma.users.count({ where: { last_active: { gte: new Date(Date.now() - 1000 * 60 * 10) } } });
    const newUsers = await prisma.users.count({ where: { created_at: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } } });
    const newestUser = await prisma.users.findFirst({ orderBy: { created_at: 'desc' } });

    res.status(200).json({ allUsersCounted, onlineUsers, newUsers, newestUser: newestUser.display_name});
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error', message: error.message});
  }
};

export default withAuth(getOnlinePlayers);