import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getOTStartDate } from '@/utils/timefunctions';
import { getIpAddress } from '@/utils/ipUtils';
import { AuthenticatedRequest } from '@/types/api';
import { countRecruitments, countRecruitmentsForTarget, performRecruitment, getUserByRecruitLink } from '@/services/Recruitment.service';
import { z } from 'zod';

const RecruitQuerySchema = z.object({
  id: z.string(),
});

const RecruitBodySchema = z.object({
  self_recruit: z.union([z.string(), z.boolean()]).optional(),
});

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse
) => {
  const validatedQuery = RecruitQuerySchema.safeParse(req.query);
  if (!validatedQuery.success) {
    return res.status(400).json({ error: 'Invalid recruitment link.' });
  }

  const { id } = validatedQuery.data;
  let recruiterID = 0;
  const session = req.session;
  if (session) {
    recruiterID = Number(session.user?.id || 0);
  }
  const recruitedUser = await getUserByRecruitLink(id as string);
  if (!recruitedUser) {
    return res.status(400).json({ error: 'Invalid recruitment link.' });
  }
  if (req.method === 'GET') {
    // For GET, keep as is, no update
    const ipAddress = getIpAddress(req as any);
    const history = await countRecruitments({
      db: prisma,
      fromUser: Number(recruiterID),
      toUser: Number(recruitedUser.id),
      ipAddress,
      includeIpWhenFromZero: true,
      since: getOTStartDate(),
    });

    if (history >= 5) {
      return res
        .status(400)
        .json({ error: 'You can only Recruit up to 5x in 24 hours.'});
    }
    const toUserHistory = await countRecruitmentsForTarget({
      db: prisma,
      fromUser: Number(recruiterID),
      toUser: Number(recruitedUser.id),
      since: getOTStartDate(),
    });

    if (toUserHistory >= 25) {
      // Handle the scenario when there are 25 or more records for to_user in the last 24 hours
      return res.status(400).json({
        error: 'This user has already recruited their 25 soldiers today.',
      });
    }
    return res.status(200).json({ showCaptcha: true });
  }
  if (req.method === 'POST') {
    const validatedBody = RecruitBodySchema.safeParse(req.body);
    if (!validatedBody.success) {
      return res.status(400).json({ error: 'Invalid request body', details: validatedBody.error.flatten().fieldErrors });
    }
    const { self_recruit } = validatedBody.data;
    const ipAddress = getIpAddress(req as any);
    const fromUser = Number(recruitedUser.id);
    const toUser = Number(recruiterID);
    const userIdToUpdate = self_recruit === '1' || self_recruit === true ? Number(session?.user.id) : toUser;

    const result = await prisma.$transaction((tx) =>
      performRecruitment({
        tx,
        fromUser,
        toUser,
        userIdToUpdate,
        ipAddress,
        strategy: 'linkBased',
        goldReward: 250,
      })
    );

    return res.status(200).json(result);
  }

  res.status(405).json({ error: 'Method not allowed' }); // Send a proper response
}

export default withAuth(handler, true);
