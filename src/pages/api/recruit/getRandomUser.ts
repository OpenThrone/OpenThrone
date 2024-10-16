import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import mtrand from '@/utils/mtrand';
import { getOTStartDate, getOTTime} from '@/utils/timefunctions';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const { session } = req;
  const recruiterID = session ? parseInt(session.user?.id.toLocaleString()) : 0;
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  const sessionRecord = await prisma.autoRecruitSession.findUnique({
    where: { id: sessionId },
  });

  if (!sessionRecord || sessionRecord.userId !== recruiterID) {
    return res.status(403).json({ error: 'Invalid session ID' });
  }

  // Update lastActivityAt to keep the session active
  await prisma.autoRecruitSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });

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
      created_at: { lt: getOTStartDate() },
    },
  });

  if (!users.length) {
    return res.status(404).json({ error: 'No users available for recruitment.' });
  }

  const userPromises = users.map(async (user: any) => {
    const recruitmentCount = await prisma.recruit_history.count({
      where: {
        to_user: recruiterID,
        from_user: recruiterID === 0 ? recruiterID : user.id,
        timestamp: { gte: getOTStartDate() },
        ...(recruiterID === 0 && { ip_addr: req.headers['cf-connecting-ip'] as string })
      },
    });   

    const remainingRecruits = 5 - recruitmentCount;
    return { user, remainingRecruits };
  });

  const validUsers = (await Promise.all(userPromises)).filter(({ remainingRecruits }) => remainingRecruits > 0);
  console.log({
    to_user: recruiterID,
    from_user: recruiterID === 0 ? recruiterID : 'user.id',
    timestamp: { gte: getOTStartDate() },
    ...(recruiterID === 0 && { ip_addr: req.headers['cf-connecting-ip'] as string })
  }
  )

  console.log(getOTTime());
  if (!validUsers.length) {
    return res.status(404).json({ error: 'No valid users available for recruitment.' });
  }

  const randomUserIndex = Math.floor(mtrand(0, validUsers.length - 1));
  const randomUser = validUsers[randomUserIndex];

  const totalLeft = validUsers.reduce((sum, { remainingRecruits }) => sum + remainingRecruits, 0);

  return res.status(200).json({ randomUser: { ...randomUser.user, remainingRecruits: randomUser.remainingRecruits }, totalLeft, "totalPlayerCount": users.length, "maxRecruitsExpected": users.length * 5 });
}

export default withAuth(handler, true);
