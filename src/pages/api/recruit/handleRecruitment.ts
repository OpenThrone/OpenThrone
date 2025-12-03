import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import mtrand from '@/utils/mtrand';
import { getIpAddress } from '@/utils/ipUtils';
import { logAction } from '@/utils/auditLogger';

import { RecruitSchema } from '@/lib/validation';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '@/types/api';
import { performRecruitment } from '@/services/recruitment.service';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const session = req.session;
  const recruiterUserId = session ? session.user.id : 0;

  let recruitedUserId: number | string = 0;
  let selfRecruit: boolean = false;
  try {
    const data = RecruitSchema.parse(req.body);
    recruitedUserId = data.recruitedUserId || 0;
    selfRecruit = data.selfRecruit || false;
    const sessionIdStr = data.sessionId || null;
    let sessionIdNum: number | null = sessionIdStr ? parseInt(sessionIdStr, 10) : null;

    if (typeof recruitedUserId === 'string' && !Number.isInteger(Number(recruitedUserId))) {
      const recruitedUser = await prisma.users.findFirst({
        where: { recruit_link: recruitedUserId },
      });
      recruitedUserId = recruitedUser?.id || 0;
    }

    // Session validation will be moved inside transaction for atomicity
    if (!sessionIdNum) {
      sessionIdNum = null; // Explicitly set sessionId to null for manual
    }

    const ipAddress = getIpAddress(req);
    const fromUser = recruiterUserId ? Number(recruitedUserId) : recruiterUserId;
    const toUser = recruiterUserId ? recruiterUserId : Number(recruitedUserId);
    const userIdToLock = selfRecruit ? Number(recruitedUserId) : Number(toUser);
    const delayMs = mtrand(5, 17) * 100;

    const result = await prisma.$transaction(async (tx) => {
      // Validate session inside transaction if present
      if (sessionIdNum) {
        const sessionData = await tx.autoRecruitSession.findUnique({
          where: { id: sessionIdNum, userId: recruiterUserId },
        });

        if (!sessionData) {
          throw new Error('Invalid session ID');
        }

        if (sessionData.lastActivityAt < new Date(Date.now() - 60000)) { // 1 minute
          await tx.autoRecruitSession.deleteMany({
            where: { id: sessionIdNum, userId: recruiterUserId },
          });
          throw new Error('Session expired');
        }
      }

      return performRecruitment({
        tx,
        fromUser,
        toUser,
        userIdToUpdate: userIdToLock,
        ipAddress,
        strategy: 'standard',
        goldReward: 250,
        delayMs,
        sessionUpdate: sessionIdNum
          ? { sessionId: sessionIdNum, recruiterUserId }
          : null,
      });
    }, { timeout: 15000, maxWait: 5000 });

    const ip = getIpAddress(req);
    await logAction(recruiterUserId || toUser, 'RECRUIT', ip, { recruitedUserId, selfRecruit });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.format() });
    }
    console.log('Error in recruitment:', error.message, "IPAddr: " + getIpAddress(req), 'PlayerID: ' + recruitedUserId, 'RecruiterID: ' + recruiterUserId);
    const statusCode = error.message.includes('recruited 5 times') || error.message.includes('Session')
      ? 409
      : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

export default withAuth(handler, true);
