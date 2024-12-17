import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import mtrand from '@/utils/mtrand';
import { endSession, getSession, validateSession } from '@/services/sessions.service';
import { createRecruitmentRecord, hasExceededRecruitmentLimit, updateUserAfterRecruitment, createBankHistoryRecord } from '@/services/recruitment.service';
import { getIpAddress } from '@/utils/ipUtils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const session = req.session;
  const recruiterUserId = session ? session.user.id : 0;
  let { recruitedUserId, selfRecruit, sessionId } = req.body;

  try {
    if (!Number.isInteger(recruitedUserId)) {
      const recruitedUser = await prisma.users.findFirst({
        where: { recruit_link: recruitedUserId },
      });
      recruitedUserId = recruitedUser?.id || 0;
    }

    // Differentiate between manual and auto-clicker sessions
    if (sessionId) {
      // Validate the session ID for auto-clicker recruitment
      const activeSessions = await validateSession(recruiterUserId, sessionId);

      if (!activeSessions) {
        return res.status(429).json({ error: 'Invalid session ID' });
      }

      const sessionData = await getSession(recruiterUserId, sessionId);

      if (sessionData.lastActivityAt < new Date(Date.now() - 60000)) { // 1 minute
        await endSession(recruiterUserId, sessionId);
        return res.status(429).json({ error: 'Session expired' });
      }
    } else {
      // If sessionId is not provided, treat it as a manual recruitment
      sessionId = null; // Explicitly set sessionId to null for manual
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const fromUser = recruiterUserId ? recruitedUserId : recruiterUserId;
        const toUser = recruiterUserId ? recruiterUserId : recruitedUserId;

        const ipAddress = getIpAddress(req);

        // Check if recruitment limit has been exceeded
        const exceededLimit = await hasExceededRecruitmentLimit({
          fromUser,
          toUser,
          ipAddress,
          recruiterUserId,
        });

        if (exceededLimit) {
          throw new Error('User has already been recruited 5 times in the last 24 hours.');
        }


        // Save the recruitment record
        await createRecruitmentRecord({ fromUser, toUser, ipAddress });

        // Wait for a random delay
        await new Promise((resolve) => setTimeout(resolve, mtrand(5, 17) * 100));

        let userToUpdate = await tx.users.findUnique({
          where: { id: Number(toUser) },
        });

        if (selfRecruit) {
          userToUpdate = await tx.users.findUnique({
            where: { id: Number(recruitedUserId) },
          });
        }

        // Update the number of citizens and gold for the user
        await updateUserAfterRecruitment(userToUpdate.id, userToUpdate.units);

        await createBankHistoryRecord(userToUpdate.id);

        return { success: true };
      },
      { timeout: 15000, maxWait: 5000 },
    );

    return res.status(200).json(result);
  } catch (error) {
    console.log('Error in recruitment:', error.message, "IPAddr: " + getIpAddress(req), 'PlayerID: ' + recruitedUserId, 'RecruiterID: ' + recruiterUserId);
    const statusCode = error.message.includes('recruited 5 times')
      ? 400
      : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

export default withAuth(handler, true);