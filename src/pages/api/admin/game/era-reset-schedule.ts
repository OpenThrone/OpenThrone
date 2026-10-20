import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  cancelEraResetSchedule,
  EraResetScheduleConflict,
  setEraResetSchedule,
} from '@/services/EraResetSchedule.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';
import { eraStartSettingsSchema } from '@/utils/eraStartSettings';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const schema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('schedule'),
      eraId: z.number().int().positive(),
      expectedEraStartDate: z.string().datetime(),
      resetAt: z.string().datetime(),
      enableLogins: z.boolean(),
      startSettings: eraStartSettingsSchema.optional(),
      confirmation: z.string(),
      expectedScheduleId: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({ action: z.literal('cancel'), scheduleId: z.string().uuid() })
    .strict(),
]);

export default withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: schema,
})(async (req: AuthenticatedRequest, res: NextApiResponse, { body }) => {
  try {
    const actor = {
      adminUserId: Number(req.session?.user?.id),
      ip: getRequestIp(req),
    };
    if (body.action === 'cancel')
      await cancelEraResetSchedule({ scheduleId: body.scheduleId, ...actor });
    else
      await setEraResetSchedule({
        eraId: body.eraId,
        expectedEraStartDate: body.expectedEraStartDate,
        resetAt: body.resetAt,
        enableLogins: body.enableLogins,
        startSettings: body.startSettings,
        confirmation: body.confirmation,
        expectedScheduleId: body.expectedScheduleId,
        ...actor,
      });
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof EraResetScheduleConflict)
      return res.status(409).json({ error: publicErrorMessage(error) });
    logError('Era reset schedule update failed', error);
    return res
      .status(500)
      .json({ error: 'Era reset schedule could not be updated.' });
  }
});
