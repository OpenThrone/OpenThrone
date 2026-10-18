import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AllianceDiplomacyService } from '@/services/AllianceDiplomacy.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
});

const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/** Allies and pending requests of an alliance; members only. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const result = await AllianceDiplomacyService.listRelations(
      Number(req.session?.user?.id),
      context.query.allianceId,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default guard(handler);
