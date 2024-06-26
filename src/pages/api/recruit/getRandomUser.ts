import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import mtrand from '@/utils/mtrand';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const session = req.session;

  const recruiterID = session ? parseInt(session.user?.id.toLocaleString()) : 0;

  // Fetch all users
  const users = await prisma.users.findMany({
    select: {
      recruit_link: true,
      id: true,
      display_name: true,
      race: true,
      class: true,
      experience: true,
    },
    where: {
      NOT: [{ id: { in: [0, recruiterID] } }],
      created_at: { lt: midnight },
    },
  });

  if (!users.length) {
    return res.status(404).json({ error: 'No users available for recruitment.' });
  }

  const userPromises = users.map(async (user: any) => {
    const recruitmentCount = await prisma.recruit_history.count({
      where: {
        to_user: recruiterID,
        from_user: user.id,
        timestamp: { gte: midnight },
      },
    });

    const remainingRecruits = (session.user.id === 1 ? 5 : 5) - recruitmentCount;
    return { user, remainingRecruits };
  });

  const validUsers = (await Promise.all(userPromises)).filter(({ remainingRecruits }) => remainingRecruits > 0);

  if (!validUsers.length) {
    return res.status(404).json({ error: 'No valid users available for recruitment.' });
  }

  const randomUserIndex = Math.floor(mtrand(0, validUsers.length - 1));
  const randomUser = validUsers[randomUserIndex];

  const totalLeft = validUsers.reduce((sum, { remainingRecruits }) => sum + remainingRecruits, 0);

  return res.status(200).json({ randomUser: { ...randomUser.user, remainingRecruits: randomUser.remainingRecruits }, totalLeft, "totalPlayerCount": users.length, "maxRecruitsExpected": users.length * 5 });
}

export default withAuth(handler);
