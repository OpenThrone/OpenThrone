import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const session = await getServerSession(req, res, authOptions);
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
        timestamp: { gte: twentyFourHoursAgo },
      },
    });

    const remainingRecruits = 10 - recruitmentCount;
    return { user, remainingRecruits };
  });

  const validUsers = (await Promise.all(userPromises)).filter(({ remainingRecruits }) => remainingRecruits > 0);

  if (!validUsers.length) {
    return res.status(404).json({ error: 'No valid users available for recruitment.' });
  }

  const randomUserIndex = Math.floor(Math.random() * validUsers.length);
  const randomUser = validUsers[randomUserIndex];

  const totalLeft = validUsers.reduce((sum, { remainingRecruits }) => sum + remainingRecruits, 0);

  return res.status(200).json({ randomUser: { ...randomUser.user, remainingRecruits: randomUser.remainingRecruits }, totalLeft });
}
