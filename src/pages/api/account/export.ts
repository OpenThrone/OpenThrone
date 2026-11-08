import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  abandonExport,
  beginExport,
  completeExport,
  streamAccountExport,
} from '@/services/AccountDataExport.service';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { isImpersonatedSession } from '@/utils/authorization';
import { logError } from '@/utils/logger';
import { respondPrivacyError } from '@/utils/privacyApi';
import { requireReauth } from '@/utils/reauth';
import { ClientGoneError, writeWithBackpressure } from '@/utils/streamWrite';

const ExportRequestSchema = z
  .object({
    password: z.string().min(1).max(1024),
    totpToken: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();

// The file can exceed Next's default 4 MB API response warning.
export const config = { api: { responseLimit: false } };

/**
 * Downloads the player's own data as JSON. Re-authentication, one download per
 * 24 hours and an audit row come first; the file is then generated and written
 * in pieces. Banned and suspended players keep access to their own data.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'password_reset',
  allowRestrictedAccount: true,
  bodySchema: ExportRequestSchema,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const userId = Number(req.session.user.id);
  if (isImpersonatedSession(req.session)) {
    return res.status(403).json({ error: 'impersonated' });
  }
  let exportId: number | null = null;
  try {
    await requireReauth(userId, 'export', context.body);
    exportId = (await beginExport(userId)).id;
    await logActionStrict({
      userId,
      action: 'ACCOUNT_DATA_EXPORT',
      ip: getRequestIp(req),
      entityType: 'AccountDataExport',
      entityId: exportId,
    });
  } catch (error) {
    if (exportId !== null) await abandonExport(exportId);
    if (respondPrivacyError(res, error)) return;
    throw error;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="openthrone-data-${userId}.json"`,
  );
  try {
    const result = await streamAccountExport(userId, (chunk) =>
      writeWithBackpressure(res, chunk),
    );
    await completeExport(exportId, result);
    res.end();
  } catch (error) {
    // Headers are already sent; cut the stream so the client sees a failure
    // instead of a truncated file that parses as complete.
    if (error instanceof ClientGoneError) {
      // The player started the download and then walked away: the generation
      // ran, so the 24-hour slot stays used. Only server-side failures refund it.
    } else {
      await abandonExport(exportId);
      logError(error, { userId }, 'Account data export failed');
    }
    res.destroy(error instanceof Error ? error : undefined);
  }
});
