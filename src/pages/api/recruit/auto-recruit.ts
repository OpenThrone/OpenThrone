import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch all users
  const users = await prisma.users.findMany({
    select: {
      recruit_link: true,
      id: true, // Select id as well, as it is needed for further filtering
    },
    where: {
      NOT: [
        {
          id: {
            in: [0],
          },
        },
      ],
    },
  });

  if (!users.length) {
    return res
      .status(404)
      .json({ error: 'No users available for recruitment.' });
  }

  //todo: 
  /* I think this needs to be updated logically.
   * When a logged in player(me) recruits another player, I get the new citizen so the to_user should be me. 
   * When a nonplayer recruits me, I get the new citizen so the to_user is me and from_user = 0. 
   * We should be returning all the people who haven't sent to me over the maximum limit (25)  
  */const userPromises = users.map(async (user: any) => {
    const totalRecruitments = await prisma.recruit_history.count({
      where: {
        from_user: {not: 0},
        to_user: user.id,
        timestamp: {
          gte: twentyFourHoursAgo,
        },
      },
    });
    if (totalRecruitments >= 40) return null; // Skip user if recruited more than 25 times

    const recruitmentsCountByRecruiter = await prisma.recruit_history.groupBy({
      by: ['from_user'],
      where: {
        to_user: user.id, // replace userId with the actual user ID you are checking
        timestamp: {
          gte: twentyFourHoursAgo,
        },
        from_user: {
          not: 0,
        },
      },
      _count: {
        from_user: true,
      },
      having: {
        from_user: {
          _count: {
            lt: 5,
          },
        },
      },
    });

    const isOverRecruited = recruitmentsCountByRecruiter.some(
      // eslint-disable-next-line no-underscore-dangle
      (recruitment: any) => recruitment._count.from_user >= 5,
    );

    if (!isOverRecruited) {
      return user;
    }
    return null;
  });

  const validUsers = (await Promise.all(userPromises)).filter(Boolean);

  if (!validUsers.length) {
    return res
      .status(404)
      .json({ error: 'No valid users available for recruitment.' });
  }

  // Randomly select a user from the validUsers
  const randomUser = validUsers[Math.floor(Math.random() * validUsers.length)];

  return res.status(200).json({ recruit_link: randomUser.recruit_link });
}
