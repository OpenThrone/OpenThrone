import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { Prisma } from '@prisma/client';
import { getUsersWithRelations } from './UserLoader.service';
import { z } from 'zod';
import {
  buildDefaultUserUpdate,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';

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
  await resetUserRelations(tx, userId);

  const user = await tx.users.findUnique({
    where: { id: userId },
    select: { colorScheme: true, race: true },
  });

  await tx.users.update({
    where: { id: userId },
    data: {
      ...buildDefaultUserUpdate(),
      currentEraId: newEraId,
      achievements,
      colorScheme: resolveColorScheme(user?.colorScheme ?? null, user?.race ?? null),
    },
  });
};

export const getActiveEra = async (tx: Tx | typeof prisma = prisma) => {
  return tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
  });
};

export const ensureActiveEra = async (tx: Tx | typeof prisma = prisma) => {
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
