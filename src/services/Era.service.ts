import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import {
  Prisma,
  type BattleUpgradeType,
  type BonusPointsType,
  type StructureUpgradeType,
  type ItemType,
  type ItemUsage,
} from '@prisma/client';
import { UnitType } from '@/types/typings';
import { getUsersWithRelations } from './UserLoader.service';
import { z } from 'zod';

// Zod schemas for validation
const EraIdSchema = z.number().int().positive();
const UserIdSchema = z.number().int().positive();
const EraNameSchema = z.string().min(1);
const EraDataSchema = z.object({
  name: EraNameSchema,
  startDate: z.date(),
  endDate: z.date().optional().nullable(),
});

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
      const validatedEraId = EraIdSchema.parse(currentEra.id);
      await tx.era.update({
        where: { id: validatedEraId },
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
        const validatedUserId = UserIdSchema.parse(u.id);
        const validatedPreviousEraId = EraIdSchema.parse(previousEraId);
        await tx.userEra.create({
          data: {
            userId: validatedUserId,
            eraId: validatedPreviousEraId,
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
      const validatedNewEraId = EraIdSchema.parse(newEra.id);
      await resetUserState(tx, u.id, validatedNewEraId, lifetimeAchievements);
    }

    // Ensure all users are associated to the newly created era even if a reset was skipped
    const validatedNewEraId = EraIdSchema.parse(newEra.id);
    await tx.users.updateMany({
      where: {},
      data: { currentEraId: validatedNewEraId },
    });

    return newEra;
  });
};