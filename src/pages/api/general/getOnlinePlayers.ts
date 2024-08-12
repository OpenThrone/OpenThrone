import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';


const getOnlinePlayers = async (req: NextApiRequest, res: NextApiResponse) => {

  try {
    const allUsersCounted = await prisma.users.count({ where: { NOT: { id: 0 } } });
    const onlineUsers = await prisma.users.count({ where: { last_active: { gte: new Date(Date.now() - 1000 * 60 * 10) } } });
    const newUsers = await prisma.users.count({ where: { created_at: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } } });
    const newestUser = await prisma.users.findFirst({ orderBy: { created_at: 'desc' } });

    res.status(200).json({ allUsersCounted, onlineUsers, newUsers, newestUser: newestUser ? newestUser.display_name : null});
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error', message: error.message});
  }
};

export default getOnlinePlayers;
