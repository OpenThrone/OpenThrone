import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getOTStartDate } from '@/utils/timefunctions';
import { getRecruitmentRecords } from '@/services/recruitment.service';

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
  const startDate = getOTStartDate(); //new Date(Number(getOTStartDate()) - 1 * 24 * 60 * 60 * 1000); // The start of the day 1 day ago
  const endDate = getOTStartDate(1); // The start of current day
  const usersWithRecruitCount = await getRecruitmentRecords(recruiterID, startDate, endDate);

  if (!usersWithRecruitCount.length) {
    return res.status(404).json({ error: 'No recruitment history found in the last 24 hours.', '24hoursago': getOTStartDate(), });
  }

  return res.status(200).json({ usersWithRecruitCount, '24hoursago': getOTStartDate() });
}

export default withAuth(handler);
