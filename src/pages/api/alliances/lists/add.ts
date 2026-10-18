import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import {
  ALLIANCE_LIST_NOTE_MAX,
  ALLIANCE_LIST_TYPES,
  AllianceListsService,
} from '@/services/AllianceLists.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  listType: z.enum(ALLIANCE_LIST_TYPES),
  targetUserId: z.number().int().min(0).optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(ALLIANCE_LIST_NOTE_MAX).optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Adds a player to a list by display name or user id; needs edit_list. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof BodySchema> },
) => {
  try {
    const result = await AllianceListsService.addEntry(
      Number(req.session?.user?.id),
      context.body,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(guardedHandler(handler), {
  rateLimitProfile: 'game_write',
});
