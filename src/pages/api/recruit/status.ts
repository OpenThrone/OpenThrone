import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getRecruitmentStatus } from '@/services/Recruitment.service';
import type { AuthenticatedRequest } from '@/types/api';

const MAX_TARGETS = 100;

const QuerySchema = z.object({
  ids: z
    .string()
    .max(1000)
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((part) => Number(part))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
});

/**
 * Daily recruitment allowance for the signed-in player: how many recruits they
 * have used overall and with each requested player, plus when the day resets.
 * Read-only; the recruit endpoints still enforce every limit.
 */
const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const recruiterId = Number(req.session?.user?.id ?? 0);
  if (!Number.isSafeInteger(recruiterId) || recruiterId <= 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid player list.' });
  }
  const targetIds = [...new Set(parsed.data.ids)].slice(0, MAX_TARGETS);
  const status = await getRecruitmentStatus({
    db: prisma,
    recruiterId,
    targetIds,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(status);
};

export default withAuth(handler);
