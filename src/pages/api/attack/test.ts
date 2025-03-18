import { NextApiRequest, NextApiResponse } from 'next';
import { simulateBattle } from '@/utils/attackFunctions';
import UserModel from '@/models/Users';
import { stringifyObj } from '@/utils/numberFormatting';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { attacker, defender, turns } = req.body;
    // Create mock users from the provided data
    const attackerUser = new UserModel(JSON.parse(attacker));
    const defenderUser = new UserModel(JSON.parse(defender));
    // Run the simulation
    const results = await simulateBattle(
      attackerUser,
      defenderUser,
      defenderUser.fortHitpoints,
      turns || 10,
      true // enable Debug messages
    );

    return res.status(200).json({
      results: stringifyObj(results),
      attackerStats: {
        unitTotals: attackerUser.unitTotals,
        attackPower: attackerUser.offense,
        defensePower: attackerUser.defense,
      },
      defenderStats: {
        unitTotals: defenderUser.unitTotals,
        attackPower: defenderUser.offense,
        defensePower: defenderUser.defense,
      }
    });
  } catch (error) {
    console.error('Battle simulation error:', error);
    return res.status(500).json({ message: 'Error simulating battle', error: String(error) });
  }
}

// Helper function to create a user object from form data
function createUserFromFormData(formData: any) {

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
  ['OFFENSE', 'DEFENSE', 'CITIZEN', 'WORKER'].forEach(unitType => {
    for (let level = 1; level <= 5; level++) {
      const quantity = formData[`${unitType.toLowerCase()}${level}`] || 0;
      if (quantity > 0) {
        user.units[unitType][level] = quantity;
      }
    }
  });

  // Process item entries
  const itemEntries = Object.entries(formData).filter(([key]) => key.startsWith('item_'));
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