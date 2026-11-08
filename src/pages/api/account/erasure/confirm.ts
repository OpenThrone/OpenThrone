import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { confirmErasure } from '@/services/AccountErasure.service';
import { getRequestIp } from '@/utils/auditLogger';
import { respondPrivacyError } from '@/utils/privacyApi';

const ConfirmSchema = z
  .object({ token: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();

/**
 * Opens the emailed link's token. Public on purpose: the token, which only the
 * address on file received, is the proof. Wrong or used tokens all answer the
 * same way.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'none',
  // The 256-bit token cannot be guessed, so a shared address (NAT, campus) that
  // opens several links must not be locked out by the tight credential budget.
  rateLimitProfile: 'public_read',
  bodySchema: ConfirmSchema,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { scheduledFor } = await confirmErasure(
      context.body.token,
      getRequestIp(req),
    );
    return res.status(200).json({ scheduledFor: scheduledFor.toISOString() });
  } catch (error) {
    if (respondPrivacyError(res, error)) return;
    throw error;
  }
});
