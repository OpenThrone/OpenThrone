// pages/api/getRandomUser.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import {
  AUTO_RECRUIT_DISABLED,
  canAutoRecruit,
} from '@/services/AutoRecruitAccess.service';
import { getValidUsersForRecruitment } from '@/services/Recruitment.service';
import { getSession, updateSessionActivity } from '@/services/Sessions.service';
import { pickRecruitTarget } from '@/utils/autoRecruitFlow';
import { logError } from '@/utils/logger';

const GetRandomUserSchema = z.object({
  sessionId: z.number().int().optional(),
  excludeUserId: z.number().int().positive().optional(),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!(await canAutoRecruit((req as any).session?.user?.id)))
    return res.status(503).json(AUTO_RECRUIT_DISABLED);
  // Cast req to any to access session property added by middleware
  const { session } = req as any;
  const recruiterID = Number(session?.user?.id ?? 0);
  // Recruiting only credits a signed-in recruiter, so anonymous callers get no targets.
  if (!Number.isSafeInteger(recruiterID) || recruiterID <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const validatedBody = GetRandomUserSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }
  const { sessionId, excludeUserId } = validatedBody.data;

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

  const {
    usersLeft,
    activeUsers: validUsers,
    recruiterCapReached,
    recruiterRemaining,
  } = await getValidUsersForRecruitment(recruiterID);

  // Remaining recruits across all targets, bounded by the recruiter's own daily cap.
  const totalRecruitsLeft = Math.min(
    recruiterRemaining,
    usersLeft.reduce(
      (sum, { remainingRecruits }) => sum + remainingRecruits,
      0,
    ),
  );

  // Filter usersLeft to only include those who can still be recruited by the recruiter today, ensuring usersLeft is an array
  const actuallyRecruitableUsers = Array.isArray(usersLeft)
    ? usersLeft.filter((user) => user.remainingRecruits > 0)
    : [];

  if (!validUsers || actuallyRecruitableUsers.length === 0) {
    // Send a specific status/error if no one is left *to be recruited by this user*
    return res.status(404).json({
      randomUser: null,
      error: 'NO_RECRUITABLE_USERS_FOUND', // Specific error code for frontend
      code: recruiterCapReached
        ? 'RECRUITER_DAILY_CAP_REACHED'
        : 'NO_RECRUITABLE_USERS_FOUND',
      recruitsLeft: 0, // No one recruitable *by you* is left
      totalPlayerCount: validUsers.length,
      maxRecruitsExpected: validUsers.length * 5,
    });
  }

  // Select a random user from the *filtered* list
  const randomUser = pickRecruitTarget(actuallyRecruitableUsers, excludeUserId);

  // This check should theoretically not be needed now, but keep as safeguard
  if (!randomUser) {
    logError(
      'Failed to select a random user even though actuallyRecruitableUsers was not empty.',
      { actuallyRecruitableUsers },
    );
    return res
      .status(500)
      .json({ error: 'Internal error selecting recruitable user.' });
  }

  return res.status(200).json({
    randomUser: {
      // Send the selected recruitable user
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
