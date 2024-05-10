import { PrismaClient } from '@prisma/client';
import { withAuth } from '@/middleware/auth';

const prisma = new PrismaClient();

const handler = async (req: any, res: any) => {

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

export default withAuth(handler);