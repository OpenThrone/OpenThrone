import type {
  BattleUpgradeType,
  BonusPointsType,
  ItemType,
  ItemUsage,
  Prisma,
  StructureUpgradeType,
} from '@prisma/client';

import { Fortifications } from '@/constants';
import type { UnitType } from '@/types/typings';

type Tx = Prisma.TransactionClient;

const DEFAULT_UNITS = [
  { type: 'CITIZEN' as UnitType, level: 1, quantity: 50, isMercenary: false },
  { type: 'WORKER' as UnitType, level: 1, quantity: 0, isMercenary: false },
  { type: 'OFFENSE' as UnitType, level: 1, quantity: 0, isMercenary: false },
  { type: 'DEFENSE' as UnitType, level: 1, quantity: 0, isMercenary: false },
  { type: 'SPY' as UnitType, level: 1, quantity: 0, isMercenary: false },
  { type: 'SENTRY' as UnitType, level: 1, quantity: 0, isMercenary: false },
];

const DEFAULT_ITEMS = [
  {
    type: 'WEAPON' as ItemType,
    level: 1,
    usage: 'OFFENSE' as ItemUsage,
    quantity: 0,
  },
];

const DEFAULT_STRUCTURE_UPGRADES = [
  { type: 'OFFENSE' as StructureUpgradeType, level: 1 },
  { type: 'SPY' as StructureUpgradeType, level: 1 },
  { type: 'SENTRY' as StructureUpgradeType, level: 1 },
  { type: 'ARMORY' as StructureUpgradeType, level: 1 },
];

const DEFAULT_BATTLE_UPGRADES = [
  { type: 'OFFENSE' as BattleUpgradeType, level: 1, quantity: 0 },
  { type: 'SPY' as BattleUpgradeType, level: 1, quantity: 0 },
  { type: 'SENTRY' as BattleUpgradeType, level: 1, quantity: 0 },
  { type: 'DEFENSE' as BattleUpgradeType, level: 1, quantity: 0 },
];

const DEFAULT_BONUS_POINTS = [
  { type: 'OFFENSE' as BonusPointsType, level: 0 },
  { type: 'DEFENSE' as BonusPointsType, level: 0 },
  { type: 'INCOME' as BonusPointsType, level: 0 },
  { type: 'INTEL' as BonusPointsType, level: 0 },
  { type: 'PRICES' as BonusPointsType, level: 0 },
];

export const ERA_DEFAULT_UNITS = DEFAULT_UNITS;
export const ERA_DEFAULT_ITEMS = DEFAULT_ITEMS;
export const ERA_DEFAULT_STRUCTURE_UPGRADES = DEFAULT_STRUCTURE_UPGRADES;
export const ERA_DEFAULT_BATTLE_UPGRADES = DEFAULT_BATTLE_UPGRADES;
export const ERA_DEFAULT_BONUS_POINTS = DEFAULT_BONUS_POINTS;

export const DEFAULT_USER_SCALARS = {
  gold: 25000,
  gold_in_bank: 0,
  attack_turns: 50,
  stamina: 100,
  maxStamina: 100,
  fort_level: 1,
  fort_hitpoints: Fortifications[0].hitpoints,
  experience: 0,
  economy_level: 0,
  house_level: 0,
  offense: 0,
  defense: 0,
  spy: 0,
  sentry: 0,
};

export const resolveColorScheme = (
  colorScheme: string | null | undefined,
  race: string | null | undefined,
) => {
  return colorScheme ?? race ?? 'ELF';
};

export const buildDefaultUserUpdate = (
  overrides: Partial<typeof DEFAULT_USER_SCALARS> = {},
) => ({
  ...DEFAULT_USER_SCALARS,
  ...overrides,
});

export const resetUserRelations = async (tx: Tx, userId: number) => {
  await Promise.all([
    tx.userUnit.deleteMany({ where: { userId } }),
    tx.userItem.deleteMany({ where: { userId } }),
    tx.userStructureUpgrade.deleteMany({ where: { userId } }),
    tx.userBattleUpgrade.deleteMany({ where: { userId } }),
    tx.userBonusPoints.deleteMany({ where: { userId } }),
  ]);

  await Promise.all([
    tx.userUnit.createMany({
      data: ERA_DEFAULT_UNITS.map((unit) => ({ ...unit, userId })),
    }),
    tx.userItem.createMany({
      data: ERA_DEFAULT_ITEMS.map((item) => ({ ...item, userId })),
    }),
    tx.userStructureUpgrade.createMany({
      data: ERA_DEFAULT_STRUCTURE_UPGRADES.map((upgrade) => ({
        ...upgrade,
        userId,
      })),
    }),
    tx.userBattleUpgrade.createMany({
      data: ERA_DEFAULT_BATTLE_UPGRADES.map((upgrade) => ({
        ...upgrade,
        userId,
      })),
    }),
    tx.userBonusPoints.createMany({
      data: ERA_DEFAULT_BONUS_POINTS.map((bonus) => ({ ...bonus, userId })),
    }),
  ]);
};
