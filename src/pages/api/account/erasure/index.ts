import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  cancelErasure,
  getErasureState,
  requestErasure,
} from '@/services/AccountErasure.service';
import { getRequestIp } from '@/utils/auditLogger';
import { isImpersonatedSession } from '@/utils/authorization';
import { respondPrivacyError } from '@/utils/privacyApi';

export const ErasureRequestSchema = z
  .object({
    password: z.string().min(1).max(1024),
    totpToken: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

/**
 * Player-facing erasure request. POST starts it (password, plus the
 * authenticator code when 2FA is on) and emails a confirmation link; GET reads
 * the state; DELETE withdraws a request that has not been confirmed yet. The
 * grace-period cancel happens at sign-in, because that account is deactivated.
 */
export default withApiGuard({
  methods: ['GET', 'POST', 'DELETE'],
  authMode: 'required',
  // The settings page reads the state on every load, so the route-wide limit is
  // the generous read one; the re-authentication budget and the hourly request
  // limit in the service are what bound abuse.
  rateLimitProfile: 'public_read',
  bodySchema: ErasureRequestSchema,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const userId = Number(req.session.user.id);
  if (isImpersonatedSession(req.session)) {
    return res.status(403).json({ error: 'impersonated' });
  }
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getErasureState(userId));
    }
    if (req.method === 'DELETE') {
      await cancelErasure(userId, { by: 'USER', ip: getRequestIp(req) });
      return res.status(200).json(await getErasureState(userId));
    }
    const { password, totpToken, reason } = context.body;
    const state = await requestErasure(userId, {
      password,
      totpToken,
      reason,
      ip: getRequestIp(req),
    });
    return res.status(202).json(state);
  } catch (error) {
    if (respondPrivacyError(res, error)) return;
    throw error;
  }
});
