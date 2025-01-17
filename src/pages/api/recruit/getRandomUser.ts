// pages/api/getRandomUser.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { getSession, updateSessionActivity } from '@/services/sessions.service';
import { getValidUsersForRecruitment } from '@/services/recruitment.service';
import mtrand from '@/utils/mtrand';
import { getIpAddress } from '@/utils/ipUtils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { session } = req;
  const recruiterID = session ? parseInt(session.user?.id.toString()) : 0;
  const { sessionId } = req.body;

  if (req.method === 'POST') {
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const sessionRecord = await getSession(recruiterID, sessionId);

    if (!sessionRecord || sessionRecord.userId !== recruiterID) {
      return res.status(403).json({ error: 'Invalid session ID' });
    }

    // Update lastActivityAt to keep the session active
    await updateSessionActivity(recruiterID, sessionId);
  }

  const ipAddress = getIpAddress(req);
  const result = await getValidUsersForRecruitment(recruiterID, ipAddress);
  if (!result || !('usersLeft' in result) || !('activeUsers' in result)) {
    return res.status(500).json({ error: 'Invalid response from recruitment service' });
  }
  const { usersLeft, activeUsers: validUsers } = result;

  if (!validUsers || usersLeft.length === 0) {
    return res.status(404).json({
      randomUser: null,
      error: 'No valid users available for recruitment.',
      recruitsLeft: usersLeft.reduce((sum, { remainingRecruits }) => sum + remainingRecruits, 0),
      totalPlayerCount: validUsers.length,
      maxRecruitsExpected: validUsers.length * 5, });
  }

  const randomUserIndex = Math.floor(mtrand(0, usersLeft.length - 1));
  const randomUser = usersLeft[randomUserIndex];

  if (!randomUser) {
    return res.status(404).json({ error: `No valid users available for recruitment.2 ${usersLeft}`});
  }

  return res.status(200).json({
    randomUser: {
      ...randomUser.user,
      remainingRecruits: randomUser.remainingRecruits,
    },
    recruitsLeft: usersLeft.reduce((sum, { remainingRecruits }) => sum + remainingRecruits, 0),
    totalPlayerCount: validUsers.length,
    maxRecruitsExpected: validUsers.length * 5,
  });
};

export default withAuth(handler, true);
