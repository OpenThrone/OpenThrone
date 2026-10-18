import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceAnnouncementsService } from '@/services/AllianceAnnouncements.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  announcementId: z.number().int().positive(),
  pinned: z.boolean(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Pins or unpins an announcement; needs post_announcements (or leader). */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { body: z.infer<typeof BodySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);

  try {
    const result = await AllianceAnnouncementsService.setPinned(
      sessionUserId,
      context.body,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
