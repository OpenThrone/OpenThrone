import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { openAllianceChatRoom } from '@/services/AllianceRoom.service';
import type { AuthenticatedRequest } from '@/types/api';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Opens (creating if needed) the alliance conversation for a member. */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  try {
    const result = await openAllianceChatRoom(
      sessionUserId,
      context.body.allianceId,
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
