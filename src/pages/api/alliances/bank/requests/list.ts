import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceGoldRequestService } from '@/services';
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

/** Lists gold requests: all for managers, own otherwise. */
const handler = async (
  req: AuthenticatedRequest,
  res: any,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  const sessionUserId = Number(req.session?.user?.id);
  const { query: input } = context;

  try {
    const result = await AllianceGoldRequestService.list(
      input.allianceId,
      sessionUserId,
    );
    return res.status(200).json(stringifyObj(result));
  } catch (error: any) {
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(guardedHandler(handler));
