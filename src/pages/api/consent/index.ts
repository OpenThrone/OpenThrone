import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { logError } from '@/utils/logger';
import { getOTStartDate } from '@/utils/timefunctions';

const BodySchema = z.object({ choice: z.enum(['granted', 'denied']) }).strict();

/**
 * Aggregate consent tally: one explicit choice (banner or cookie settings)
 * increments today's counter. Public on purpose — consent must be reportable
 * before sign-in — and deliberately stores no IP, no user id and no user
 * agent, so nothing here can identify a visitor. The Global Privacy Control
 * default is never reported, only explicit choices.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'none',
  // Same budget as other cheap public writes: one call per explicit choice
  // must not lock out shared addresses (NAT, campus networks).
  rateLimitProfile: 'public_read',
  bodySchema: BodySchema,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'no-store');
  const { choice } = context.body;
  // Buckets follow the OT calendar day, like every other daily rule.
  const day = getOTStartDate(0);
  try {
    await prisma.consentTally.upsert({
      where: { day_choice: { day, choice } },
      update: { count: { increment: 1 } },
      create: { day, choice, count: 1 },
    });
  } catch (error) {
    logError('Failed to record consent tally:', error);
    // The visitor's choice is already stored client-side; a failed tally is
    // acceptable, so this answers softly instead of surfacing an error.
    return res.status(200).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
});
