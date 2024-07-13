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
    killingStrength: 150,
    defenseStrength: 50
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
    killingStrength: 750,
    defenseStrength: 250
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
    killingStrength: 50,
    defenseStrength: 150
  },
  {
    type: 'DEFENSE',
    name: 'Catapult',
    SiegeUpgradeLevel: 6,
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 1,
    minUnitLevel: 2,
    killingStrength: 250,
    defenseStrength: 750
  },
  {
    type: 'SPY',
    name: 'Disguise Clothes',
    SiegeUpgradeLevel: 6,
    level: 1,
    bonus: 200,
    cost: 100000,
    unitsCovered: 1,
    minUnitLevel: 2,
    killingStrength: 50,
    defenseStrength: 150
  },
  {
    type: 'SPY',
    name: 'Informant',
    SiegeUpgradeLevel: 6,
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 1,
    minUnitLevel: 2,
    killingStrength: 250,
    defenseStrength: 750
  },
  {
    type: 'SENTRY',
    name: 'Guard Dog',
    SiegeUpgradeLevel: 6,
    level: 1,
    bonus: 200,
    cost: 100000,
    unitsCovered: 1,
    minUnitLevel: 2,
    killingStrength: 50,
    defenseStrength: 150
  },
  {
    type: 'SENTRY',
    name: 'Watch Tower',
    SiegeUpgradeLevel: 6,
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 5,
    minUnitLevel: 2,
    killingStrength: 250,
    defenseStrength: 750
  }
];
