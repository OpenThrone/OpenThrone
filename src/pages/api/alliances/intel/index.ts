import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AllianceIntelService } from '@/services/AllianceIntel.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  filter: z.enum(['all', 'threats']).default('all'),
  callId: z.coerce.number().int().positive().optional(),
});

const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/** Shared-report feed, newest first; alliance members only. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const result = await AllianceIntelService.listFeed(
      Number(req.session?.user?.id),
      context.query,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default guard(handler);
