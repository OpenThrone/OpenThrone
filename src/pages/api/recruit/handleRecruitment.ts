import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';

import prisma from '@/lib/prisma';
import { RecruitSchema } from '@/lib/validation';
import { withAuth } from '@/middleware/auth';
import {
  getUserByRecruitLink,
  performRecruitmentWithSessionValidation,
} from '@/services/Recruitment.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logAction } from '@/utils/auditLogger';
import { getIpAddress } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';
import { mtRand as mtrand } from '@/utils/mtrand';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const { session } = req;
  const recruiterUserId = session ? session.user.id : 0;

  let recruitedUserId: number | string = 0;
  let selfRecruit: boolean = false;
  try {
    const data = RecruitSchema.parse(req.body);
    recruitedUserId = data.recruitedUserId || 0;
    selfRecruit = data.selfRecruit || false;
    const sessionIdStr = data.sessionId || null;
    let sessionIdNum: number | null = sessionIdStr
      ? parseInt(sessionIdStr, 10)
      : null;

    if (
      typeof recruitedUserId === 'string' &&
      !Number.isInteger(Number(recruitedUserId))
    ) {
      const recruitedUser = await getUserByRecruitLink(recruitedUserId);
      recruitedUserId = recruitedUser?.id || 0;
    }

    // Session validation will be moved inside transaction for atomicity
    if (!sessionIdNum) {
      sessionIdNum = null; // Explicitly set sessionId to null for manual
    }

    const ipAddress = getIpAddress(req);
    const fromUser = recruiterUserId
      ? Number(recruitedUserId)
      : recruiterUserId;
    const toUser = recruiterUserId || Number(recruitedUserId);
    const userIdToLock = selfRecruit ? Number(recruitedUserId) : Number(toUser);
    const delayMs = mtrand(5, 17) * 100;

    const result = await prisma.$transaction(
      (tx) =>
        performRecruitmentWithSessionValidation({
          tx,
          fromUser,
          toUser,
          userIdToUpdate: userIdToLock,
          ipAddress,
          strategy: 'standard',
          goldReward: 250,
          delayMs,
          sessionId: sessionIdNum,
          recruiterUserId,
        }),
      { timeout: 15000, maxWait: 5000 },
    );

    const ip = getIpAddress(req);
    await logAction(recruiterUserId || toUser, 'RECRUIT', ip, {
      recruitedUserId,
      selfRecruit,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid input', details: error.format() });
    }
    logError('Error in recruitment', {
      message: error.message,
      ipAddress: getIpAddress(req),
      playerId: recruitedUserId,
      recruiterId: recruiterUserId,
    });
    const statusCode =
      error.message.includes('recruited 5 times') ||
      error.message.includes('Session')
        ? 409
        : 500;
    return res.status(statusCode).json({ error: error.message });
  }
};

export default withAuth(handler, true);
