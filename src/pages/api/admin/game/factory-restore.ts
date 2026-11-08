import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { CurrentEraResetError } from '@/services/CurrentEraReset.service';
import {
  EraResetScheduleConflict,
  startImmediateEraReset,
} from '@/services/EraResetSchedule.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { eraResetPhrase } from '@/utils/eraResetPhrase';
import { eraStartSettingsSchema } from '@/utils/eraStartSettings';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const bodySchema = z
  .object({
    eraId: z.number().int().positive(),
    expectedEraStartDate: z
      .string()
      .datetime()
      .transform((value) => new Date(value)),
    confirmation: z.string(),
    enableLogins: z.boolean().optional().default(false),
    startSettings: eraStartSettingsSchema.optional(),
  })
  .strict()
  .superRefine(({ eraId, confirmation }, context) => {
    if (confirmation !== eraResetPhrase(eraId, true)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmation'],
        message: 'Confirmation does not match the active era',
      });
    }
  });

/**
 * Complete factory restore (#13): the ordinary era reset plus the deletion of
 * every alliance. This is the only route that deletes alliances in a reset;
 * `reset-current-era` keeps them (reserved) and rejects this option.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema,
})(async (req: AuthenticatedRequest, res: NextApiResponse, { body }) => {
  const adminUserId = Number(req.session?.user?.id);
  const ip = getRequestIp(req);
  try {
    // A destructive restore never runs off the record: request audit first.
    await logActionStrict({
      userId: adminUserId,
      action: 'ADMIN_FACTORY_RESTORE_REQUESTED',
      ip,
      entityType: 'Era',
      entityId: body.eraId,
      details: { eraId: body.eraId },
    });
    const result = await startImmediateEraReset({
      eraId: body.eraId,
      expectedEraStartDate: body.expectedEraStartDate,
      confirmation: body.confirmation,
      enableLogins: body.enableLogins,
      startSettings: body.startSettings,
      adminUserId,
      ip,
      factoryRestore: true,
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof EraResetScheduleConflict)
      return res.status(409).json({ error: publicErrorMessage(error) });
    if (error instanceof CurrentEraResetError) {
      const status = error.code === 'ERA_NOT_FOUND' ? 404 : 409;
      return res
        .status(status)
        .json({ error: publicErrorMessage(error), code: error.code });
    }
    logError('Factory restore failed', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
