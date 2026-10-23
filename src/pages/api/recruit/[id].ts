import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import {
  getRecruitmentBlock,
  getUserByRecruitLink,
  RECRUITMENT_BLOCK_ERRORS,
} from '@/services/Recruitment.service';
import { isRecruitmentCaptchaRequired } from '@/services/RecruitmentCaptcha.service';
import type { AuthenticatedRequest } from '@/types/api';

const RecruitQuerySchema = z.object({
  id: z.string().min(1),
});

/**
 * Pre-check for the recruit page: tells the client whether to show the captcha.
 * It applies the same rules as /api/recruit/handleRecruitment (signed-in
 * recruiter, no self-recruit, pair limit and daily caps) so nobody solves a
 * captcha only to be refused. Rewards are only granted by handleRecruitment;
 * this route deliberately has no POST.
 */
const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validatedQuery = RecruitQuerySchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(400).json({ error: 'Invalid recruitment link.' });
  }

  const recruitedUser = await getUserByRecruitLink(validatedQuery.data.id);
  if (!recruitedUser) {
    return res.status(400).json({ error: 'Invalid recruitment link.' });
  }

  const recruiterId = Number(req.session?.user?.id ?? 0);
  if (!Number.isSafeInteger(recruiterId) || recruiterId <= 0) {
    return res
      .status(200)
      .json({ eligible: false, showCaptcha: false, code: 'LOGIN_REQUIRED' });
  }

  if (recruitedUser.id === recruiterId) {
    return res.status(400).json({
      error: 'You cannot recruit yourself.',
      code: 'SELF_RECRUIT_REJECTED',
    });
  }

  const block = await getRecruitmentBlock({
    db: prisma,
    recruiterId,
    targetId: recruitedUser.id,
  });
  if (block) {
    return res
      .status(409)
      .json({ error: RECRUITMENT_BLOCK_ERRORS[block], code: block });
  }

  return res
    .status(200)
    .json({ eligible: true, showCaptcha: isRecruitmentCaptchaRequired() });
};

// Anonymous visitors may load the page; they are told to sign in instead.
export default withAuth(handler, true);
