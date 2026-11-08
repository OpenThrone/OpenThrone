import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getSponsorshipInfo } from '@/services/supporter/AllianceSponsorship.service';
import { requireSupporter } from '@/services/supporter/api';
import type { AuthenticatedRequest } from '@/types/api';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = await requireSupporter(req, res, 'GET');
  if (!userId) return;
  const id = Number(req.query.id);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !(await prisma.alliances.findUnique({ where: { id } }))
  )
    return res.status(404).json({ error: 'Alliance not found' });
  return res.status(200).json(await getSponsorshipInfo(id));
}
export default withAuth(handler);
