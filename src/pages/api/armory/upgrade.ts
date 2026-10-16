import type { NextApiResponse } from 'next';

import { withAuth } from '@/middleware/auth';
import { ArmoryService } from '@/services/Armory.service';
import { markGameplayActivity } from '@/services/GameplayActivity.service';
import type { AuthenticatedRequest } from '@/types/api';
import { ArmoryUpgradeSchema } from '@/utils/armoryUpgradeSchema';
import { logError } from '@/utils/logger';

export const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const parsed = ArmoryUpgradeSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid upgrade order' });
  const { userId } = parsed.data;
  if (userId !== Number(req.session?.user?.id))
    return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
  try {
    const result = await ArmoryService.upgradeItems({
      userId,
      conversions: parsed.data.conversions.map(
        ({ fromItem, toItem, conversionAmount }) => ({
          fromItem,
          toItem,
          conversionAmount,
        }),
      ),
    });
    await markGameplayActivity(userId);
    return res.status(200).json(result);
  } catch (error) {
    logError('API Error: /api/armory/upgrade', { userId, error });
    const message = error instanceof Error ? error.message : '';
    if (/^(Cannot |Not enough |Invalid )/.test(message))
      return res.status(400).json({ error: message });
    if (message === 'User not found')
      return res.status(404).json({ error: message });
    return res.status(500).json({ error: 'Failed to upgrade equipment' });
  }
};

export default withAuth(handler, { rateLimitProfile: 'game_write' });
