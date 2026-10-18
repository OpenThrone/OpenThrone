import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  AllianceListsService,
  LOOKUP_BATCH_MAX,
} from '@/services/AllianceLists.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const QuerySchema = z
  .object({
    targetUserId: z.coerce.number().int().positive().optional(),
    targetUserIds: z
      .string()
      .max(1000)
      .transform((value) => value.split(',').map((part) => part.trim()))
      .pipe(
        z
          .array(z.string().regex(/^\d+$/).transform(Number))
          .min(1)
          .max(LOOKUP_BATCH_MAX),
      )
      .optional(),
  })
  .refine(
    (q) => (q.targetUserId === undefined) !== (q.targetUserIds === undefined),
    { message: 'Provide targetUserId or targetUserIds' },
  );

const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/**
 * Which of the viewer's alliances list a target (only where view_list is held).
 * `?targetUserId=` returns one lookup; `?targetUserIds=1,2,3` (max 100) returns
 * a map keyed by target user id.
 */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const viewerId = Number(req.session?.user?.id);
    const { targetUserId, targetUserIds } = context.query;
    const result =
      targetUserIds !== undefined
        ? await AllianceListsService.lookupTargets(viewerId, targetUserIds)
        : await AllianceListsService.lookupTarget(
            viewerId,
            Number(targetUserId),
          );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default guard(handler);
