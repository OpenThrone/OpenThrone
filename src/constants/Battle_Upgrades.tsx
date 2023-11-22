import { UnitUpgradeType } from "@/types/typings";

export const BattleUpgrades: UnitUpgradeType[] = [
  {
    type: 'OFFENSE',
    name: 'Steeds',
    StructureUpgradeLevelRequired: 1,
    level: 1,
    bonus: 200,
    cost: 100000,
    unitsCovered: 1
  },
  {
    type: 'OFFENSE',
    name: 'War Elephant',
    StructureUpgradeLevelRequired: 1,
    level: 2,
    bonus: 1000,
    cost: 5000000,
    unitsCovered: 1,
  },
  {
    type: 'DEFENSE',
    name: 'Guard Tower',
    StructureUpgradeLevelRequired: 1,
    level: 1,
    bonus: 200,
    cost: 100000,
    unitsCovered: 5,
  },
];