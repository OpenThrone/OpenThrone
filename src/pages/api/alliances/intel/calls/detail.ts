import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { AllianceIntelService } from '@/services/AllianceIntel.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
  callId: z.coerce.number().int().positive(),
});

const guard = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/** One call with its attached reports, newest first; members only. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const result = await AllianceIntelService.getCall(
      Number(req.session?.user?.id),
      context.query,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default guard(handler);
