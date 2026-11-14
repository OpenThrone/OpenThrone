import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import { AllianceUpgradeService } from '@/services/AllianceUpgrade.service';
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

/** Alliance Hall level, member count, treasury and the viewer's deposit slots. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof QuerySchema> },
) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const status = await AllianceUpgradeService.getStatus(
      context.query.allianceId,
      Number(req.session?.user?.id),
    );
    return res.status(200).json(stringifyObj(status));
  } catch (error: any) {
    if (error?.message?.startsWith('Forbidden')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(400).json({ error: publicErrorMessage(error) });
  }
};

export default withAuth(guardedHandler(handler));
