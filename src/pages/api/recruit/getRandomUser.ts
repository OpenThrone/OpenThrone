// pages/api/getRandomUser.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import { getSession, updateSessionActivity } from '@/services/sessions.service';
import { getValidUsersForRecruitment } from '@/services/recruitment.service';
import mtrand from '@/utils/mtrand';
import { getIpAddress } from '@/utils/ipUtils';
import { logError } from '@/utils/logger'; // Import logger at the top

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Cast req to any to access session property added by middleware
  const { session } = req as any;
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

  // Calculate total remaining recruits *before* filtering, ensuring usersLeft is an array
  const totalRecruitsLeft = Array.isArray(usersLeft)
    ? usersLeft.reduce((sum, { remainingRecruits }) => sum + remainingRecruits, 0)
    : 0;

  // Filter usersLeft to only include those who can still be recruited by the recruiter today, ensuring usersLeft is an array
  const actuallyRecruitableUsers = Array.isArray(usersLeft)
    ? usersLeft.filter(user => user.remainingRecruits > 0)
    : [];

  if (!validUsers || actuallyRecruitableUsers.length === 0) {
    // Send a specific status/error if no one is left *to be recruited by this user*
    return res.status(404).json({
      randomUser: null,
      error: 'NO_RECRUITABLE_USERS_FOUND', // Specific error code for frontend
      recruitsLeft: 0, // No one recruitable *by you* is left
      totalPlayerCount: validUsers.length,
      maxRecruitsExpected: validUsers.length * 5,
    });
  }

  // Select a random user from the *filtered* list
  const randomUserIndex = Math.floor(mtrand(0, actuallyRecruitableUsers.length - 1));
  const randomUser = actuallyRecruitableUsers[randomUserIndex];

  // This check should theoretically not be needed now, but keep as safeguard
  if (!randomUser) {
     logError('Failed to select a random user even though actuallyRecruitableUsers was not empty.', { actuallyRecruitableUsers });
     return res.status(500).json({ error: 'Internal error selecting recruitable user.' });
  }

  return res.status(200).json({
    randomUser: { // Send the selected recruitable user
      ...randomUser.user,
      remainingRecruits: randomUser.remainingRecruits,
    },
    recruitsLeft: totalRecruitsLeft, // Report the total remaining across all users initially fetched
    totalPlayerCount: validUsers.length,
    maxRecruitsExpected: validUsers.length * 5,
  });
};

// Removed duplicate imports from here

export default withAuth(handler, true);
