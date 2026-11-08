import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';

import prisma from '@/lib/prisma';
import { RecruitSchema } from '@/lib/validation';
import { withAuth } from '@/middleware/auth';
import {
  AUTO_RECRUIT_DISABLED,
  canAutoRecruit,
} from '@/services/AutoRecruitAccess.service';
import {
  getRecruitTargetById,
  getUserByRecruitLink,
  getValidUsersForRecruitment,
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
    if (sessionIdNum !== null && !(await canAutoRecruit(recruiterUserId)))
      return res.status(503).json(AUTO_RECRUIT_DISABLED);

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
    // Auto-recruit targets (numeric, inside a session) passed Turnstile in
    // startSession; the session is re-validated against this recruiter inside
    // the reward transaction. Recruit links always need their own token.
    const sessionRecruit =
      sessionIdNum !== null && isNumericTarget(recruitedUserId);
    if (
      !sessionRecruit &&
      !(await verifyRecruitmentCaptcha(data.captchaToken, ipAddress))
    ) {
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

    // The write has already committed; an ancillary count failure must not turn a
    // successful recruitment into an apparent failure and invite a retry.
    if (sessionIdNum !== null) {
      try {
        const { usersLeft, recruiterRemaining } =
          await getValidUsersForRecruitment(recruiterUserId);
        const recruitsLeft = Math.min(
          recruiterRemaining,
          usersLeft.reduce((sum, entry) => sum + entry.remainingRecruits, 0),
        );
        return res.status(200).json({ ...result, recruitsLeft });
      } catch (error) {
        logError('Error counting remaining recruits:', error);
      }
    }
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
