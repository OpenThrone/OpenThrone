import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import UserModel from '@/models/Users';
import { BattleService } from '@/services';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

const TestAttackSchema = z.object({
  attacker: z.string(),
  defender: z.string(),
  turns: z.number().int().optional(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'attack',
  bodySchema: TestAttackSchema,
});

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    body: z.infer<typeof TestAttackSchema>;
  },
) {
  try {
    const { attacker, defender, turns } = context.body;
    // Create mock users from the provided data
    const attackerUser = new UserModel(JSON.parse(attacker));
    const defenderUser = new UserModel(JSON.parse(defender));

    // Use BattleService for simulation
    const result = await BattleService.simulateBattleWithData(
      attacker,
      defender,
      turns || 10,
    );

    return res.status(200).json({
      results: stringifyObj(result),
      attackerStats: {
        unitTotals: attackerUser.unitTotals,
        attackPower: attackerUser.offense,
        defensePower: attackerUser.defense,
      },
      defenderStats: {
        unitTotals: defenderUser.unitTotals,
        attackPower: defenderUser.offense,
        defensePower: defenderUser.defense,
      },
    });
  } catch (error) {
    logError('Battle simulation error:', error);
    return res.status(500).json({ message: 'Error simulating battle' });
  }
}

export default guardedHandler(handler);

// Helper function to create a user object from form data
function _createUserFromFormData(formData: any) {
  const user = {
    id: formData.id || Math.floor(Math.random() * 10000),
    display_name: formData.display_name || 'Simulator User',
    race: formData.race || 'HUMAN',
    class: formData.class || 'FIGHTER',
    level: formData.level || 1,
    experience: formData.experience || 0,
    gold: 0,
    units: [],
    items: [],
    structure_upgrades: formData.structure_upgrades || [],
    battle_upgrades: formData.battle_upgrades || [],
    fortLevel: formData.fortLevel || 1,
    fortHitpoints: formData.fortHitpoints || 100,
    bonus_points: formData.bonus_points || [],
  };

  // Add units from the form data
  ['OFFENSE', 'DEFENSE', 'CITIZEN', 'WORKER'].forEach((unitType) => {
    for (let level = 1; level <= 5; level++) {
      const quantity = formData[`${unitType.toLowerCase()}${level}`] || 0;
      if (quantity > 0) {
        user.units[unitType][level] = quantity;
      }
    }
  });

  // Process item entries
  const itemEntries = Object.entries(formData).filter(([key]) =>
    key.startsWith('item_'),
  );
  itemEntries.forEach(([key, value]) => {
    if (typeof value === 'number' && value > 0) {
      const parts = key.split('_');
      const type = parts[1].toUpperCase();
      const level = parseInt(parts[2], 10);
      const usage = parts[3] ? parts[3].toUpperCase() : 'OFFENSE';

      user.items.push({
        type,
        level,
        quantity: value,
        usage,
      });
    }
  });

  return user;
}
