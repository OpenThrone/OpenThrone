import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import UserModel from '@/models/Users';
import { lockEraLifecycle } from '@/utils/eraLifecycleLock';
import {
  DEFAULT_ERA_START_SETTINGS,
  type EraStartSettings,
  resolveEraStartSettings,
} from '@/utils/eraStartSettings';

import {
  buildDefaultUserUpdate,
  buildEraStartOverrides,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';
import { getUsersWithRelations } from './UserLoader.service';

// Zod schemas for validation
const EraIdSchema = z.number().int().positive();
const UserIdSchema = z.number().int().positive();
const EraNameSchema = z.string().min(1);
const _EraDataSchema = z.object({
  name: EraNameSchema,
  startDate: z.date(),
  endDate: z.date().optional().nullable(),
});

type Tx = Prisma.TransactionClient;

const buildLifetimeAchievements = (
  current: unknown,
  eraAchievements: {
    maxLevelReached: number;
    totalAttacksWon: number;
    totalDefendsWon: number;
  },
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
    maxLevelReached: Math.max(
      parsed.maxLevelReached ?? 0,
      eraAchievements.maxLevelReached ?? 0,
    ),
    totalAttacksWon:
      (parsed.totalAttacksWon ?? 0) + (eraAchievements.totalAttacksWon ?? 0),
    totalDefendsWon:
      (parsed.totalDefendsWon ?? 0) + (eraAchievements.totalDefendsWon ?? 0),
  };
};

const resetUserState = async (
  tx: Tx,
  userId: number,
  newEraId: number,
  achievements: Record<string, any>,
  settings?: EraStartSettings,
) => {
  await resetUserRelations(tx, userId, settings);

  const user = await tx.users.findUnique({
    where: { id: userId },
    select: { colorScheme: true, race: true },
  });

  const overrides = settings ? buildEraStartOverrides(settings) : {};

  await tx.users.update({
    where: { id: userId },
    data: {
      ...buildDefaultUserUpdate(overrides),
      currentEraId: newEraId,
      achievements,
      colorScheme: resolveColorScheme(
        user?.colorScheme ?? null,
        user?.race ?? null,
      ),
    },
  });
};

const getActiveEra = async (tx: Tx | typeof prisma = prisma) => {
  return tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
  });
};

const getLatestEra = async (tx: Tx | typeof prisma = prisma) => {
  return tx.era.findFirst({
    orderBy: { startDate: 'desc' },
  });
};

/** Ensure active era. */
export const ensureActiveEra = async (tx: Tx | typeof prisma = prisma) => {
  const current = await getActiveEra(tx);
  if (current) return current;

  const latest = await tx.era.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  const nextId = (latest?.id ?? 0) + 1;

  return tx.era.create({
    data: { name: `Era ${nextId}`, startDate: new Date() },
  });
};

/** Get active era start settings. */
export const getActiveEraStartSettings = async (
  tx: Tx | typeof prisma = prisma,
): Promise<EraStartSettings> => {
  const activeEra = await ensureActiveEra(tx);
  return resolveEraStartSettings(activeEra.startSettings);
};

/** Start new era. */
export const startNewEra = async (settings?: EraStartSettings) => {
  const resolved = settings ?? DEFAULT_ERA_START_SETTINGS;

  return prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    const currentEra = await getActiveEra(tx);
    let previousEraId: number | null = null;

    if (currentEra) {
      const validatedEraId = EraIdSchema.parse(currentEra.id);
      await tx.era.update({
        where: { id: validatedEraId },
        data: { endDate: new Date() },
      });
      previousEraId = currentEra.id;
      // Events that ran "until the era ends" end with it (#86).
      await tx.gameEvent.updateMany({
        where: {
          eraId: validatedEraId,
          status: { in: ['ACTIVE', 'SCHEDULED', 'PAUSED'] },
        },
        data: { status: 'COMPLETED', deactivatedAt: new Date() },
      });
    }

    const newEra = await tx.era.create({
      data: {
        name: `Era ${currentEra ? currentEra.id + 1 : 1}`,
        startDate: new Date(),
        startSettings: resolved as Prisma.InputJsonValue,
      },
    });
    const allUsers = await getUsersWithRelations({}, tx);
    const users = allUsers.filter((u) => u.id > 0);

    for (const u of users) {
      const userModel = new UserModel(
        u,
        u.UserUnit,
        u.UserItem,
        u.UserStructureUpgrade,
        u.UserBattleUpgrade,
        u.UserBonusPoints,
        u.permissions,
        u.stats,
        false,
        true,
      );

      const eraAttackFilter = {
        type: 'attack',
        ...(currentEra
          ? { timestamp: { gte: currentEra.startDate, lt: newEra.startDate } }
          : {}),
      };
      const [attacksWon, defendsWon] = await Promise.all([
        tx.attack_log.count({
          where: { ...eraAttackFilter, attacker_id: u.id, winner: u.id },
        }),
        tx.attack_log.count({
          where: { ...eraAttackFilter, defender_id: u.id, winner: u.id },
        }),
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
            levelAtEnd: userModel.level,
            snapshotAtEnd: {
              experience: u.experience,
              stats: u.stats,
              units: u.UserUnit,
              items: u.UserItem,
              structureUpgrades: u.UserStructureUpgrade,
              battleUpgrades: u.UserBattleUpgrade,
              bonusPoints: u.UserBonusPoints,
            } as Prisma.InputJsonValue,
          },
        });
      }

      const lifetimeAchievements = buildLifetimeAchievements(
        u.achievements,
        eraAchievements,
      );
      const validatedNewEraId = EraIdSchema.parse(newEra.id);
      await resetUserState(
        tx,
        u.id,
        validatedNewEraId,
        lifetimeAchievements,
        resolved,
      );
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
