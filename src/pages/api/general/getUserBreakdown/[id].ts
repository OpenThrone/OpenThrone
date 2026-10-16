'use server';

import { IdQuerySchema } from '@/lib/validation';
import { withAuth } from '@/middleware/auth';
import { GeneralService } from '@/services';

const handler = async (req, res) => {
  const sessionUserId = Number(req.session?.user?.id);
  if (!req.session || !Number.isSafeInteger(sessionUserId)) {
    return res.status(401).json({ status: 'failed', error: 'Unauthorized' });
  }

  const queryParse = IdQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return res.status(400).json({
      status: 'failed',
      details: queryParse.error.flatten().fieldErrors,
    });
  }
  const { id } = queryParse.data;
  // Full loadouts are visible only to their owner; no spy-intel rule covers this read.
  if (Number(id) !== sessionUserId) {
    return res.status(403).json({ status: 'failed', error: 'Forbidden' });
  }

  const user = await GeneralService.getUserBreakdown(Number(id));
  if (!user) {
    return res.status(404).json({ status: 'failed', error: 'User not found' });
  }
  return res.status(200).json({
    status: 'success',
    results: {
      player: user.display_name,
      xp: user.experience,
      units: user.UserUnit,
      items: user.UserItem,
      battle_upgrades: user.UserBattleUpgrade,
      structure_upgrades: user.UserStructureUpgrade,
      fort: user.fort_level,
      proficiencies: user.UserBonusPoints,
    },
  });
};

export default withAuth(handler);
