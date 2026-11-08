import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import {
  adminCancelErasure,
  adminExpediteErasure,
  adminOpenErasure,
} from '@/services/AccountErasure.service';
import { getRequestIp } from '@/utils/auditLogger';
import { respondPrivacyError } from '@/utils/privacyApi';

const Body = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('open'),
      userId: z.number().int().positive(),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.enum(['cancel', 'expedite']),
      requestId: z.number().int().positive(),
      reason: z.string().min(1).max(500),
    })
    .strict(),
]);

/**
 * Staff handling of an erasure on a verified support request. `open` starts the
 * normal grace period for a player who cannot sign in; `cancel` stops a live
 * request; `expedite` erases before the grace period ends. All three need a
 * written reason (checked in the service) and are audited. Administrators only.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  bodySchema: Body,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'no-store');
  const adminId = Number(req.session.user.id);
  const ip = getRequestIp(req);
  const body = context.body as z.infer<typeof Body>;
  try {
    if (body.action === 'open') {
      if (body.userId === adminId) {
        return res.status(403).json({ error: 'staff_account' });
      }
      const created = await adminOpenErasure(body.userId, {
        adminId,
        reason: body.reason,
        ip,
      });
      return res.status(201).json({ id: created.id });
    }
    if (body.action === 'cancel') {
      await adminCancelErasure(body.requestId, {
        adminId,
        reason: body.reason,
        ip,
      });
    } else {
      await adminExpediteErasure(body.requestId, {
        adminId,
        reason: body.reason,
        ip,
      });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (respondPrivacyError(res, error)) return;
    throw error;
  }
});
