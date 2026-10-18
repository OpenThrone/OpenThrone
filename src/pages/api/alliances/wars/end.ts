import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceWarService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { publicErrorMessage } from '@/utils/publicError';

const EndWarSchema = z.object({ warId: z.coerce.number().int().positive() });

/** Ends a war (declare_war in either alliance taking part). */
const endWarHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const parsed = EndWarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid war' });
  try {
    return res
      .status(200)
      .json(
        await AllianceWarService.endWar(
          parsed.data.warId,
          Number(req.session.user.id),
        ),
      );
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(endWarHandler);
