// pages/api/recruit/startSession.ts
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { withAuth } from '@/middleware/auth';
import {
  AUTO_RECRUIT_DISABLED,
  canAutoRecruit,
} from '@/services/AutoRecruitAccess.service';
import {
  getRecruitmentCaptcha,
  verifyRecruitmentCaptcha,
} from '@/services/RecruitmentCaptcha.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getIpAddress } from '@/utils/ipUtils';

const handler = async (req: AuthenticatedRequest, res) => {
  if (!(await canAutoRecruit(req.session?.user?.id)))
    return res.status(503).json(AUTO_RECRUIT_DISABLED);
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_FOUND' });
  }
  // One captcha check opens the session; recruits inside it are tied to
  // this session in the reward transaction and skip the per-recruit check.
  const captcha = await getRecruitmentCaptcha();
  if (captcha.required) {
    const token = req.body?.captchaToken;
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({
        error: 'Verification is required to start a session.',
        code: 'CAPTCHA_REQUIRED',
        captchaProvider: captcha.provider,
      });
    }
    if (!(await verifyRecruitmentCaptcha(token, getIpAddress(req)))) {
      return res.status(400).json({
        error: 'Captcha verification failed.',
        code: 'CAPTCHA_FAILED',
        captchaProvider: captcha.provider,
      });
    }
  }

  let userId = 0;
  const { session } = req;
  if (session) {
    userId = session.user.id;
  }

  const MAX_SESSIONS_PER_USER = 2; // Limit to 1 active session per user

  const expirationTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

  const newSession = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Expire old sessions
      await tx.autoRecruitSession.deleteMany({
        where: {
          userId,
          lastActivityAt: { lt: expirationTime },
        },
      });

      // Count active sessions (lastActivityAt >= expirationTime)
      const activeSessions = await tx.autoRecruitSession.count({
        where: {
          userId,
          lastActivityAt: { gte: expirationTime },
        },
      });

      if (activeSessions >= MAX_SESSIONS_PER_USER) {
        throw new Error('Too many active sessions');
      }

      // Create a new session
      return tx.autoRecruitSession.create({
        data: {
          userId,
        },
      });
    },
  );

  return res.status(200).json({ sessionId: newSession.id });
};

export default withAuth(handler, true);
