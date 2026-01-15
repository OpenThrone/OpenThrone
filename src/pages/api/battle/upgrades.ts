import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { BattleService } from '@/services';
import { logError } from '@/utils/logger';

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

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validatedBody = UpgradesSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  try {
    const { userId, items, operation = 'buy' } = validatedBody.data;

    const result = await BattleService.manageBattleUpgrades({
      userId,
      items,
      operation,
    });

    return res.status(200).json(result);
  } catch (error) {
    logError(error);
    return res.status(500).json({
      error: 'Failed to manage battle upgrades',
      message: error.message,
    });
  }
};

export default withAuth(handler);
