import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceLoanService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  querySchema: QuerySchema,
});

/** Lists loans: all for managers (leader or manage_bank), own otherwise. */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  try {
    const result = await AllianceLoanService.list(
      context.query.allianceId,
      sessionUserId,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(guardedHandler(handler));
