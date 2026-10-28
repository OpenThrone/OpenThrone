import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { CaptiveService, DungeonError } from '@/services/Captives.service';
import { logError } from '@/utils/logger';

const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('ransom'),
      captiveId: z.number().int().positive(),
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('release'),
      captiveId: z.number().int().positive(),
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('convert'),
      captiveId: z.number().int().positive(),
      operationId: z.string().uuid(),
    })
    .strict(),
]);

const handler = async (req, res) => {
  if (!req.session) return res.status(401).json({ message: 'Unauthorized' });
  const userId = req.session.user.id;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    const { action, captiveId, operationId } = actionSchema.parse(req.body);
    const input = { userId, captiveId, operationId };
    const result =
      action === 'ransom'
        ? await CaptiveService.ransom(input)
        : action === 'release'
          ? await CaptiveService.release(input)
          : await CaptiveService.convert(input);
    return res.status(200).json({ result });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid dungeon order' });
    // Expected refusals carry a player-facing message; anything else is a
    // server fault and must not leak internals.
    if (error instanceof DungeonError)
      return res.status(400).json({ message: error.message });
    logError(error);
    return res.status(500).json({ message: 'Unable to process dungeon order' });
  }
};

export default withAuth(handler, { rateLimitProfile: 'game_write' });
