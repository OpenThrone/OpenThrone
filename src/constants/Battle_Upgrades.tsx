import type { UnitUpgradeType } from '@/types/typings';

export const BattleUpgrades: UnitUpgradeType[] = [
  {
    type: 'OFFENSE',
    name: 'Steeds',
    SiegeUpgradeLevel: 6,
    level: 1,
    bonus: 200,
    cost: 100000,
    unitsCovered: 1,
    minUnitLevel: 2,
  },
  {
    type: 'OFFENSE',
    name: 'War Elephant',
    SiegeUpgradeLevel: 6,
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 1,
    minUnitLevel: 2,
  },
  {
    type: 'DEFENSE',
    name: 'Guard Tower',
    SiegeUpgradeLevel: 6,
    level: 1,
    bonus: 200,
    cost: 100000,
    unitsCovered: 5,
    minUnitLevel: 2,
  },
];
