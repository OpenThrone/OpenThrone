import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { withAuth } from '@/middleware/auth';
import {
  AllianceIntelService,
  INTEL_NOTE_MAX,
} from '@/services/AllianceIntel.service';
import type { AuthenticatedRequest } from '@/types/api';
import { stringifyObj } from '@/utils/numberFormatting';
import { publicErrorMessage } from '@/utils/publicError';

const BodySchema = z.object({
  allianceId: z.number().int().positive(),
  attackLogId: z.number().int().positive(),
  note: z.string().trim().max(INTEL_NOTE_MAX).optional(),
  callId: z.number().int().positive().optional(),
  reportThreat: z.boolean().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  bodySchema: BodySchema,
});

/** Shares a battle or spy report with an alliance; needs share_reports. */
const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { body: z.infer<typeof BodySchema> },
) => {
  try {
    const result = await AllianceIntelService.shareReport(
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
