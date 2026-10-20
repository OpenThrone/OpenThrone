import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services/Battle.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const BattleUpgradeItemSchema = z.object({
  type: z.string(),
  level: z.number().int(),
  quantity: z.number().int(),
});

const UpgradesSchema = z.object({
  userId: z.number().int(),
  items: z.array(BattleUpgradeItemSchema),
  operation: z.enum(['buy', 'sell']).optional(),
});

// Business-rule rejections that are safe to show the player (400)
const CLIENT_ERROR_PREFIXES = [
  'Cannot ',
  'Not enough gold',
  'Invalid item type',
  'Invalid quantity',
  'User not found',
];

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!req.session?.user?.id) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const validatedBody = UpgradesSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { userId, items, operation = 'buy' } = validatedBody.data;

  // Only the signed-in user may buy or sell their own battle upgrades
  if (userId !== Number(req.session.user.id)) {
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  }

  try {
    const result = await BattleService.manageBattleUpgrades({
      userId,
      items,
      operation,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logError(error, { userId, operation }, 'API Error: /api/battle/upgrades');
    if (
      typeof error?.message === 'string' &&
      CLIENT_ERROR_PREFIXES.some((prefix) => error.message.startsWith(prefix))
    ) {
      return res.status(400).json({ error: publicErrorMessage(error) });
    }
    return res.status(500).json({
      error: 'Failed to manage battle upgrades',
    });
  }
};

export default withAuth(handler, { rateLimitProfile: 'game_write' });
