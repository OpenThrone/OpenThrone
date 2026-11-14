import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceDuesService } from '@/services/AllianceDues.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/**
 * Join fee, dues and next collection for any signed-in player (shown before
 * joining); members also get their own arrears and whether they may change it.
 */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const status = await AllianceDuesService.getStatus(
      context.query.allianceId,
      Number(req.session?.user?.id),
    );
    return res.status(200).json(stringifyObj(status));
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(guardedHandler(handler));
