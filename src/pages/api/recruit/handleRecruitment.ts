import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';

import { AUTO_RECRUIT_ENABLED } from '@/constants/AutoRecruit';
import prisma from '@/lib/prisma';
import { RecruitSchema } from '@/lib/validation';
import { withAuth } from '@/middleware/auth';
import {
  getRecruitTargetById,
  getUserByRecruitLink,
  performRecruitmentWithSessionValidation,
  recruitmentBlockCodeForError,
  resolveRecruitmentContext,
} from '@/services/Recruitment.service';
import { verifyRecruitmentCaptcha } from '@/services/RecruitmentCaptcha.service';
import { parseRecruitmentSessionId } from '@/services/recruitmentGuards';
import type { AuthenticatedRequest } from '@/types/api';
import { logAction } from '@/utils/auditLogger';
import { getIpAddress } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';
import { mtRand as mtrand } from '@/utils/mtrand';
import { publicErrorMessage } from '@/utils/publicError';

/** Numeric targets are the auto-recruit form; recruit links are strings. */
const isNumericTarget = (value: number | string): boolean =>
  typeof value === 'number' || Number.isInteger(Number(value));

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method not allowed
  }

  const { session } = req;
  // Anonymous visits must never credit gold: the reward always goes to the signed-in recruiter.
  const recruiterUserId = Number(session?.user?.id ?? 0);
  if (!Number.isSafeInteger(recruiterUserId) || recruiterUserId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let recruitedUserId: number | string = 0;
  let selfRecruit: boolean = false;
  try {
    const data = RecruitSchema.parse(req.body);
    recruitedUserId = data.recruitedUserId || 0;
    selfRecruit = data.selfRecruit || false;
    if (selfRecruit) {
      return res.status(400).json({
        error: 'Self-recruitment is not allowed.',
        code: 'SELF_RECRUIT_REJECTED',
      });
    }
    const sessionIdNum = parseRecruitmentSessionId(data.sessionId);
    if (sessionIdNum !== null && !AUTO_RECRUIT_ENABLED)
      return res.status(503).json({
        error: 'Auto-Recruit is currently disabled.',
        code: 'AUTO_RECRUIT_DISABLED',
      });

    let targetUserId: number;
    if (isNumericTarget(recruitedUserId)) {
      // A numeric target is only accepted from a logged-in auto-recruit session,
      // never for anonymous callers or self-recruit rewards to a different account.
      if (!recruiterUserId || sessionIdNum === null || selfRecruit) {
        return res.status(400).json({
          error: 'A valid recruitment link is required.',
          code: 'RECRUIT_LINK_REQUIRED',
        });
      }
      targetUserId = Number(recruitedUserId);
      if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ error: 'Invalid recruitment target.' });
      }
      const target = await getRecruitTargetById(targetUserId);
      if (!target) {
        return res.status(400).json({ error: 'Recruitment target not found.' });
      }
    } else {
      const recruitedUser = await getUserByRecruitLink(String(recruitedUserId));
      if (!recruitedUser) {
        return res.status(400).json({ error: 'Invalid recruitment link.' });
      }
      targetUserId = recruitedUser.id;
    }

    if (targetUserId === recruiterUserId) {
      return res.status(400).json({
        error: 'You cannot recruit yourself.',
        code: 'SELF_RECRUIT_REJECTED',
      });
    }

    const ipAddress = getIpAddress(req);
    if (!(await verifyRecruitmentCaptcha(data.captchaToken, ipAddress))) {
      return res.status(400).json({
        error: 'Captcha verification failed.',
        code: 'CAPTCHA_FAILED',
      });
    }
    // The link owner is the sender; the signed-in recruiter receives the reward.
    const fromUser = targetUserId;
    const toUser = recruiterUserId;
    const userIdToLock = toUser;
    const delayMs = mtrand(5, 17) * 100;

    const context = await resolveRecruitmentContext();
    const result = await prisma.$transaction(
      (tx) =>
        performRecruitmentWithSessionValidation({
          tx,
          context,
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
      { timeout: 15000, maxWait: 5000, isolationLevel: 'ReadCommitted' },
    );

    const ip = getIpAddress(req);
    await logAction(recruiterUserId || toUser, 'RECRUIT', ip, {
      recruitedUserId: targetUserId,
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
      message: publicErrorMessage(error),
      ipAddress: getIpAddress(req),
      playerId: recruitedUserId,
      recruiterId: recruiterUserId,
    });
    // Cap and limit refusals carry a code so clients stop instead of retrying.
    const code = recruitmentBlockCodeForError(error.message);
    if (code) {
      return res.status(409).json({ error: publicErrorMessage(error), code });
    }
    const statusCode = error.message.includes('Session') ? 409 : 500;
    return res.status(statusCode).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(handler, { rateLimitProfile: 'game_write' });
