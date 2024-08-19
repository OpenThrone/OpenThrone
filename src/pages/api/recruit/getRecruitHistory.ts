import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getOTStartDate } from '@/utils/timefunctions';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const session = req?.session;
  const requestID = req?.query?.id;
  const recruiterID = requestID ? parseInt(requestID.toString()) : (session ? parseInt(session.user?.id.toLocaleString()) : 0);
  const startDate = new Date(Number(getOTStartDate()) - 1 * 24 * 60 * 60 * 1000); // The start of the day 1 day ago
  const endDate = getOTStartDate(); // The start of current day
  // Fetch all recruitment records within the last 24 hours for the recruiter
  const recruitmentRecords = await prisma.recruit_history.findMany({
    where: {
      from_user: { not: { in: [0, recruiterID] } },
      to_user: recruiterID,
      timestamp: {
        gte: startDate, 
        lt: endDate, 
      },
    },
    select: {
      from_user: true,
      timestamp: true,
      to_user: true,
    },
  });

  if (!recruitmentRecords.length) {
    return res.status(404).json({ error: 'No recruitment history found in the last 24 hours.', '24hoursago': getOTStartDate(), });
  }

  // Count the number of times each user has been recruited
  const recruitCountMap: { [key: number]: number } = {};
  recruitmentRecords.forEach(record => {
    recruitCountMap[record.from_user] = (recruitCountMap[record.from_user] || 0) + 1;
  });

  // Fetch user details for the recruited users
  const userIds = Object.keys(recruitCountMap).map(id => parseInt(id));
  const recruitedUsers = await prisma.users.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      display_name: true,
      race: true,
      class: true,
      experience: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  // Add recruit count to user details
  const usersWithRecruitCount = recruitedUsers.map(user => ({
    ...user,
    recruitCount: recruitCountMap[user.id],
  }));

  return res.status(200).json({ usersWithRecruitCount, '24hoursago': getOTStartDate(), recruitmentRecords });
}

export default withAuth(handler);
