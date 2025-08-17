import type { UnitUpgradeType } from '@/types/typings';

export const BattleUpgrades: UnitUpgradeType[] = [
  {
    type: 'OFFENSE',
    name: 'Steeds',
    SiegeUpgradeLevel: 6,
    level: 1,
    bonus: 200, // This bonus might become redundant or need re-evaluation with new stats
    cost: 100000,
    unitsCovered: 1,
    minUnitLevel: 2,
    MeleeAtkPower: 150,
    MeleeDefPower: 50,
    RangedAtkPower: 0,
    RangedDefPower: 75,
  },
  {
    type: 'OFFENSE',
    name: 'War Elephant',
    SiegeUpgradeLevel: 6, //16
    level: 2,
    bonus: 1000, // This bonus might become redundant or need re-evaluation with new stats
    cost: 5000000,
    unitsCovered: 1,
    minUnitLevel: 2,
    MeleeAtkPower: 750,
    MeleeDefPower: 250,
    RangedAtkPower: 0,
    RangedDefPower: 100,
  },
  {
    type: 'DEFENSE',
    name: 'Guard Tower',
    SiegeUpgradeLevel: 6,
    level: 1,
    bonus: 200, // This bonus might become redundant or need re-evaluation with new stats
    cost: 100000,
    unitsCovered: 5,
    minUnitLevel: 2,
    MeleeAtkPower: 0,
    MeleeDefPower: 150,
    RangedAtkPower: 50,
    RangedDefPower: 100,
  },
  {
    type: 'DEFENSE',
    name: 'Catapult',
    SiegeUpgradeLevel: 6, //16
    level: 2,
    bonus: 1000, // This bonus might become redundant or need re-evaluation with new stats
    cost: 5000000,
    unitsCovered: 1,
    minUnitLevel: 2,
    MeleeAtkPower: 0,
    MeleeDefPower: 0,
    RangedAtkPower: 250,
    RangedDefPower: 0,
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
    MeleeAtkPower: 0, // Spy upgrades don't have direct combat stats
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  },
  {
    type: 'SPY',
    name: 'Informant',
    SiegeUpgradeLevel: 6, //16
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 1,
    minUnitLevel: 2,
    MeleeAtkPower: 0, // Spy upgrades don't have direct combat stats
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
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
    MeleeAtkPower: 0, // Sentry upgrades don't have direct combat stats
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  },
  {
    type: 'SENTRY',
    name: 'Watch Tower',
    SiegeUpgradeLevel: 6, //16
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 5,
    minUnitLevel: 2,
    MeleeAtkPower: 0, // Sentry upgrades don't have direct combat stats
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  }
];
