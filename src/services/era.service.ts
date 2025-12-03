import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import {
  BattleUpgradeType,
  BonusPointsType,
  ItemType,
  ItemUsage,
  Prisma,
  StructureUpgradeType,
  UnitType,
} from '@prisma/client';
import { getUsersWithRelations } from './userLoader';

type Tx = Prisma.TransactionClient;

const DEFAULT_UNITS = [
  { type: UnitType.CITIZEN, level: 1, quantity: 50, isMercenary: false },
  { type: UnitType.WORKER, level: 1, quantity: 0, isMercenary: false },
  { type: UnitType.OFFENSE, level: 1, quantity: 0, isMercenary: false },
  { type: UnitType.DEFENSE, level: 1, quantity: 0, isMercenary: false },
  { type: UnitType.SPY, level: 1, quantity: 0, isMercenary: false },
  { type: UnitType.SENTRY, level: 1, quantity: 0, isMercenary: false },
];

const DEFAULT_ITEMS = [
  {
    type: ItemType.WEAPON,
    level: 1,
    usage: ItemUsage.OFFENSE,
    quantity: 0,
  },
];

const DEFAULT_STRUCTURE_UPGRADES = [
  { type: StructureUpgradeType.OFFENSE, level: 1 },
  { type: StructureUpgradeType.SPY, level: 1 },
  { type: StructureUpgradeType.SENTRY, level: 1 },
  { type: StructureUpgradeType.ARMORY, level: 1 },
];

const DEFAULT_BATTLE_UPGRADES = [
  { type: BattleUpgradeType.OFFENSE, level: 1, quantity: 0 },
  { type: BattleUpgradeType.SPY, level: 1, quantity: 0 },
  { type: BattleUpgradeType.SENTRY, level: 1, quantity: 0 },
  { type: BattleUpgradeType.DEFENSE, level: 1, quantity: 0 },
];

const DEFAULT_BONUS_POINTS = [
  { type: BonusPointsType.OFFENSE, level: 0 },
  { type: BonusPointsType.DEFENSE, level: 0 },
  { type: BonusPointsType.INCOME, level: 0 },
  { type: BonusPointsType.INTEL, level: 0 },
  { type: BonusPointsType.PRICES, level: 0 },
];

// Export defaults for reuse when creating users
export const ERA_DEFAULT_UNITS = DEFAULT_UNITS;
export const ERA_DEFAULT_ITEMS = DEFAULT_ITEMS;
export const ERA_DEFAULT_STRUCTURE_UPGRADES = DEFAULT_STRUCTURE_UPGRADES;
export const ERA_DEFAULT_BATTLE_UPGRADES = DEFAULT_BATTLE_UPGRADES;
export const ERA_DEFAULT_BONUS_POINTS = DEFAULT_BONUS_POINTS;

const buildLifetimeAchievements = (
  current: unknown,
  eraAchievements: { maxLevelReached: number; totalAttacksWon: number; totalDefendsWon: number },
) => {
  let parsed: Record<string, any> = {};

  if (typeof current === 'string') {
    try {
      parsed = JSON.parse(current);
    } catch {
      parsed = {};
    }
  } else if (current && typeof current === 'object') {
    parsed = current as Record<string, any>;
  }

  return {
    ...parsed,
    maxLevelReached: Math.max(parsed.maxLevelReached ?? 0, eraAchievements.maxLevelReached ?? 0),
    totalAttacksWon: (parsed.totalAttacksWon ?? 0) + (eraAchievements.totalAttacksWon ?? 0),
    totalDefendsWon: (parsed.totalDefendsWon ?? 0) + (eraAchievements.totalDefendsWon ?? 0),
  };
};

const resetUserState = async (tx: Tx, userId: number, newEraId: number, achievements: Record<string, any>) => {
  await Promise.all([
    tx.userUnit.deleteMany({ where: { userId } }),
    tx.userItem.deleteMany({ where: { userId } }),
    tx.userStructureUpgrade.deleteMany({ where: { userId } }),
    tx.userBattleUpgrade.deleteMany({ where: { userId } }),
    tx.userBonusPoints.deleteMany({ where: { userId } }),
  ]);

  await tx.userUnit.createMany({
    data: DEFAULT_UNITS.map(unit => ({ ...unit, userId })),
  });

  await tx.userItem.createMany({
    data: DEFAULT_ITEMS.map(item => ({ ...item, userId })),
  });

  await tx.userStructureUpgrade.createMany({
    data: DEFAULT_STRUCTURE_UPGRADES.map(upgrade => ({ ...upgrade, userId })),
  });

  await tx.userBattleUpgrade.createMany({
    data: DEFAULT_BATTLE_UPGRADES.map(upgrade => ({ ...upgrade, userId })),
  });

  await tx.userBonusPoints.createMany({
    data: DEFAULT_BONUS_POINTS.map(bonus => ({ ...bonus, userId })),
  });

  await tx.users.update({
    where: { id: userId },
    data: {
      experience: 0,
      gold: BigInt('25000'),
      gold_in_bank: BigInt('0'),
      attack_turns: 50,
      stamina: 100,
      maxStamina: 100,
      fort_hitpoints: 50,
      fort_level: 1,
      house_level: 0,
      economy_level: 0,
      offense: 0,
      defense: 0,
      spy: 0,
      sentry: 0,
      currentEraId: newEraId,
      achievements,
    },
  });
};

export const getActiveEra = async (tx: Tx | typeof prisma = prisma) => {
  return tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
  });
};

export const ensureActiveEra = async (tx: Tx) => {
  const current = await getActiveEra(tx);
  if (current) return current;
  return tx.era.create({
    data: { name: 'Era 1', startDate: new Date() },
  });
};

export const startNewEra = async () => {
  return prisma.$transaction(async tx => {
    const currentEra = await getActiveEra(tx);
    let previousEraId: number | null = null;

    if (currentEra) {
      await tx.era.update({
        where: { id: currentEra.id },
        data: { endDate: new Date() },
      });
      previousEraId = currentEra.id;
    }

    const newEra = await tx.era.create({
      data: {
        name: `Era ${currentEra ? currentEra.id + 1 : 1}`,
        startDate: new Date(),
      },
    });

    const users = await getUsersWithRelations({}, tx);

    for (const u of users) {
      const userModel = new UserModel(
        u as any,
        (u as any).UserUnit,
        (u as any).UserItem,
        (u as any).UserStructureUpgrade,
        (u as any).UserBattleUpgrade,
        (u as any).UserBonusPoints,
        (u as any).permissions,
        (u as any).stats,
        false,
        true,
      );

      const [attacksWon, defendsWon] = await Promise.all([
        tx.attack_log.count({ where: { attacker_id: u.id, winner: u.id } }),
        tx.attack_log.count({ where: { defender_id: u.id, winner: u.id } }),
      ]);

      const eraAchievements = {
        maxLevelReached: userModel.level,
        totalAttacksWon: attacksWon,
        totalDefendsWon: defendsWon,
      };

      if (previousEraId) {
        await tx.userEra.create({
          data: {
            userId: u.id,
            eraId: previousEraId,
            levelAtStart: userModel.level,
            unitsAtStart: userModel.units,
            achievements: eraAchievements,
            rankAtEnd: u.rank ?? null,
            goldAtEnd: u.gold ?? null,
            goldInBankAtEnd: u.gold_in_bank ?? null,
            offenseAtEnd: u.offense ?? null,
            defenseAtEnd: u.defense ?? null,
            spyAtEnd: u.spy ?? null,
            sentryAtEnd: u.sentry ?? null,
            fortLevelAtEnd: u.fort_level ?? null,
            houseLevelAtEnd: u.house_level ?? null,
            economyLevelAtEnd: u.economy_level ?? null,
          },
        });
      }

      const lifetimeAchievements = buildLifetimeAchievements(u.achievements, eraAchievements);
      await resetUserState(tx, u.id, newEra.id, lifetimeAchievements);
    }

    // Ensure all users are associated to the newly created era even if a reset was skipped
    await tx.users.updateMany({
      where: {},
      data: { currentEraId: newEra.id },
    });

    return newEra;
  });
};
