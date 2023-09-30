import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  });

  if (!users.length) {
    return res.status(404).json({ error: 'No users available for recruitment.' });
  }

  const validUsers = [];

  for (const user of users) {
    // Check if the user has been recruited more than 25 times in the last 24 hours
    const totalRecruitments = await prisma.recruit_history.count({
      where: {
        to_user: user.id,
        timestamp: {
          gte: twentyFourHoursAgo,
        },
      },
    });

    if (totalRecruitments >= 25) continue; // Skip user if recruited more than 25 times
    
    // Check if the user has been recruited by the same recruiter more than 5 times
    const sameRecruiterRecruitments = await prisma.recruit_history.count({
      where: {
        to_user: user.id,
        from_user: { not: 0 }, // Exclude from_user = 0
        timestamp: {
          gte: twentyFourHoursAgo,
        },
      },
    });

    if (sameRecruiterRecruitments < 5) validUsers.push(user); // Add user to validUsers if recruited less than 5 times by the same recruiter
  }

  if (!validUsers.length) {
    return res.status(404).json({ error: 'No valid users available for recruitment.' });
  }

  // Randomly select a user from the validUsers
  const randomUser = validUsers[Math.floor(Math.random() * validUsers.length)];

  return res.status(200).json({ recruit_link: randomUser.recruit_link });
}
