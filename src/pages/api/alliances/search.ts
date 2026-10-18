import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  ALLIANCE_SEARCH_MIN,
  AllianceDiplomacyService,
} from '@/services/AllianceDiplomacy.service';
import type { AuthenticatedRequest } from '@/types/api';

const QuerySchema = z.object({
  q: z.string().trim().min(ALLIANCE_SEARCH_MIN).max(50),
  excludeId: z.coerce.number().int().positive().optional(),
});

const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/** Alliance name search for the ally request picker (id, name, members, leader). */
const handler = async (
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const result = await AllianceDiplomacyService.searchByName(context.query);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default guard(handler);
