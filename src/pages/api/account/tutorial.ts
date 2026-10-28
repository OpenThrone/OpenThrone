import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import { isImpersonatedSession } from '@/utils/authorization';
import type { TutorialAction } from '@/utils/tutorialState';
import {
  applyTutorialAction,
  parseTutorialState,
  TUTORIAL_CHAPTERS,
} from '@/utils/tutorialState';

const TutorialActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }).strict(),
  z
    .object({
      type: z.literal('complete-chapter'),
      chapter: z.enum(TUTORIAL_CHAPTERS),
    })
    .strict(),
  z
    .object({
      type: z.literal('replay-chapter'),
      chapter: z.enum(TUTORIAL_CHAPTERS),
    })
    .strict(),
  z.object({ type: z.literal('snooze') }).strict(),
  z.object({ type: z.literal('dismiss') }).strict(),
  z.object({ type: z.literal('finish') }).strict(),
  z.object({ type: z.literal('restart') }).strict(),
]);

/**
 * Saves new-player tutorial progress on the account, so clearing cookies or
 * local storage cannot bring the tutorial back. The server applies the action
 * to the stored state and returns the result.
 */
export default withApiGuard({
  methods: ['POST'],
  authMode: 'required',
  rateLimitProfile: 'public_read',
  bodySchema: TutorialActionSchema,
})(async (req, res, context) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const userId = Number(req.session.user.id);
  const action = context.body as TutorialAction;
  const stored = await prisma.users.findUnique({
    where: { id: userId },
    select: { tutorial_state: true },
  });
  if (!stored) return res.status(404).json({ error: 'User not found.' });

  // An admin viewing as a player must not change that player's progress.
  if (isImpersonatedSession(req.session)) {
    return res.status(200).json({
      tutorial: applyTutorialAction(
        parseTutorialState(stored.tutorial_state),
        action,
      ),
      saved: false,
    });
  }

  const tutorial = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const locked = await tx.users.findUnique({
      where: { id: userId },
      select: { tutorial_state: true },
    });
    const next = applyTutorialAction(
      parseTutorialState(locked?.tutorial_state),
      action,
    );
    await tx.users.update({
      where: { id: userId },
      data: { tutorial_state: next },
    });
    return next;
  });
  return res.status(200).json({ tutorial, saved: true });
});
