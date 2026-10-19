import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceService } from '@/services';
import { markGameplayActivity } from '@/services/GameplayActivity.service';
import type { AuthenticatedRequest } from '@/types/api';
import { publicErrorMessage } from '@/utils/publicError';

const RespondSchema = z.object({
  inviteId: z.coerce.number().int().positive(),
  accept: z.boolean(),
});

/** The invited player accepts or declines an alliance invitation. */
const respondHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const parsed = RespondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const userId = Number(req.session.user.id);
  try {
    const result = await AllianceService.respondToInvite(
      parsed.data.inviteId,
      userId,
      parsed.data.accept,
    );
    if (parsed.data.accept) await markGameplayActivity(userId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(respondHandler);
