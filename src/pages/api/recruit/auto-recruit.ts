import type { NextApiResponse } from 'next';

import { AUTO_RECRUIT_ENABLED } from '@/constants/AutoRecruit';
import { withAuth } from '@/middleware/auth';
import {
  getRandomAutoRecruitUser,
  RECRUITER_DAILY_CAP_ERROR,
} from '@/services/Recruitment.service';
import type { AuthenticatedRequest } from '@/types/api';

/** Returns the next recruit link for the signed-in recruiter's auto-recruit loop. */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!AUTO_RECRUIT_ENABLED)
    return res.status(503).json({
      error: 'Auto-Recruit is currently disabled.',
      code: 'AUTO_RECRUIT_DISABLED',
    });
  if (req.method !== 'GET') {
    return res.status(405).end(); // Method not allowed
  }

  const recruiterId = Number(req.session?.user?.id ?? 0);
  if (!Number.isSafeInteger(recruiterId) || recruiterId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const next = await getRandomAutoRecruitUser(recruiterId);

  if ('blocked' in next) {
    return next.blocked === 'RECRUITER_DAILY_CAP_REACHED'
      ? res.status(409).json({
          error: RECRUITER_DAILY_CAP_ERROR,
          code: 'RECRUITER_DAILY_CAP_REACHED',
        })
      : res.status(404).json({
          error: 'No valid users available for recruitment.',
          code: 'NO_RECRUITABLE_USERS_FOUND',
        });
  }

  return res.status(200).json({ recruit_link: next.recruit_link });
}

export default withAuth(handler);
