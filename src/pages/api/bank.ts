import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

import { authOptions } from './auth/[...nextauth]';

const prisma = new PrismaClient();

export default async function handler(req: any, res: any) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: {
      id: typeof(session.user.id) === 'string' ? parseInt(session.user.id) : session.user.id,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json(user);
};
