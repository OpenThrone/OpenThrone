import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import {
  EXTERNAL_DAILY_CAP_ERROR,
  getExternalRecruitmentStatus,
  getUserByRecruitLink,
  IP_DAILY_CAP_ERROR,
  performExternalRecruitment,
  resolveRecruitmentContext,
} from '@/services/Recruitment.service';
import {
  isRecruitmentCaptchaRequired,
  verifyRecruitmentCaptcha,
} from '@/services/RecruitmentCaptcha.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getIpAddress } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const link = req.query.id;
    if (typeof link !== 'string' || !link)
      return res.status(400).json({ error: 'Invalid recruitment link.' });
    const owner = await getUserByRecruitLink(link);
    if (!owner)
      return res.status(400).json({ error: 'Invalid recruitment link.' });
    const ipAddress = getIpAddress(req);
    if (ipAddress === 'No IP address detected.')
      return res.status(400).json({ error: 'Client address unavailable.' });
    if (req.method === 'GET') {
      const status = await getExternalRecruitmentStatus({
        ownerId: owner.id,
        ipAddress,
      });
      return res.status(status.code ? 409 : 200).json({
        ...status,
        eligible: !status.code,
        showCaptcha: !status.code && isRecruitmentCaptchaRequired(),
      });
    }
    if (!(await verifyRecruitmentCaptcha(req.body?.captchaToken, ipAddress))) {
      return res.status(400).json({
        error: 'Captcha verification failed.',
        code: 'CAPTCHA_FAILED',
      });
    }
    const context = await resolveRecruitmentContext();
    const result = await prisma.$transaction(
      (tx) =>
        performExternalRecruitment({
          tx,
          ownerId: owner.id,
          ipAddress,
          context,
        }),
      { timeout: 15000, maxWait: 5000, isolationLevel: 'ReadCommitted' },
    );
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code =
      message === EXTERNAL_DAILY_CAP_ERROR
        ? 'EXTERNAL_DAILY_CAP_REACHED'
        : message === IP_DAILY_CAP_ERROR
          ? 'IP_DAILY_CAP_REACHED'
          : null;
    if (code) return res.status(409).json({ error: message, code });
    logError('External recruitment failed', { message });
    return res.status(500).json({ error: 'Unable to complete recruitment.' });
  }
}

export default withAuth(handler, {
  allowAnonymous: true,
  rateLimitProfile: 'game_write',
});
