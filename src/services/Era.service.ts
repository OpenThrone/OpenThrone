import { z } from 'zod';

import prisma from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import UserModel from '@/models/Users';
import { CaptiveService } from '@/services/Captives.service';
import {
  ERA_TRANSACTION_OPTIONS,
  lockEraLifecycle,
} from '@/utils/eraLifecycleLock';
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

/** Thrown when the era to end is no longer the active one (a repeated or stale request). */
export class StaleEraError extends Error {
  constructor() {
    super('The active era changed; reload before starting a new era.');
    this.name = 'StaleEraError';
  }
}

/** Start new era. */
export const startNewEra = async (
  settings?: EraStartSettings,
  options: { expectedEraId?: number } = {},
) => {
  const resolved = settings ?? DEFAULT_ERA_START_SETTINGS;

  return prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    // Battles lock their two players in id order; taking every player the
    // same way lets an in-flight battle finish before its players reset.
    await tx.$queryRaw`SELECT id FROM users WHERE id > 0 ORDER BY id FOR UPDATE`;
    const currentEra = await getActiveEra(tx);
    // Checked under the lock: a retried request queued behind a rollover
    // must not end the era that rollover just started.
    if (
      options.expectedEraId !== undefined &&
      currentEra?.id !== options.expectedEraId
    ) {
      throw new StaleEraError();
    }
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

    // Era wins per player in two grouped scans instead of two counts per player.
    const window = currentEra
      ? Prisma.sql`AND timestamp >= ${currentEra.startDate} AND timestamp < ${newEra.startDate}`
      : Prisma.empty;
    const [attackWinRows, defendWinRows] = await Promise.all([
      tx.$queryRaw<{ id: number; wins: number }[]>`
        SELECT attacker_id AS id, count(*)::int AS wins FROM attack_log
        WHERE type = 'attack' AND winner = attacker_id ${window}
        GROUP BY attacker_id`,
      tx.$queryRaw<{ id: number; wins: number }[]>`
        SELECT defender_id AS id, count(*)::int AS wins FROM attack_log
        WHERE type = 'attack' AND winner = defender_id ${window}
        GROUP BY defender_id`,
    ]);
    const attackWins = new Map<number, number>(
      attackWinRows.map((r) => [r.id, r.wins]),
    );
    const defendWins = new Map<number, number>(
      defendWinRows.map((r) => [r.id, r.wins]),
    );
    const validatedNewEraId = EraIdSchema.parse(newEra.id);
    const snapshots: Prisma.UserEraCreateManyInput[] = [];

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

      const eraAchievements = {
        maxLevelReached: userModel.level,
        totalAttacksWon: attackWins.get(u.id) ?? 0,
        totalDefendsWon: defendWins.get(u.id) ?? 0,
      };

      if (previousEraId) {
        const validatedUserId = UserIdSchema.parse(u.id);
        const validatedPreviousEraId = EraIdSchema.parse(previousEraId);
        snapshots.push({
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
        });
      }

      const lifetimeAchievements = buildLifetimeAchievements(
        u.achievements,
        eraAchievements,
      );
      await resetUserState(
        tx,
        u.id,
        validatedNewEraId,
        lifetimeAchievements,
        resolved,
      );
    }

    if (snapshots.length > 0) await tx.userEra.createMany({ data: snapshots });

    // Ensure all users are associated to the newly created era even if a reset was skipped
    await tx.users.updateMany({
      where: {},
      data: { currentEraId: validatedNewEraId },
    });

    await tx.forceReserve.updateMany({
      data: {
        available: 0,
        woundedQuantity: 0,
        eraId: validatedNewEraId,
        lastHealedAt: new Date(),
      },
    });
    // Dungeon captives (#210) are all freed without returning: the reset
    // wipes every army anyway. The captive event ledger stays as history.
    await CaptiveService.clearCaptivesForEra(tx);
    await tx.forceEvent.updateMany({
      where: { action: 'PILLAGE_PENDING' },
      data: { action: 'PILLAGE_CANCELLED' },
    });
    await tx.forceDuesRule.updateMany({ data: { nextIssueAt: new Date() } });
    return newEra;
  }, ERA_TRANSACTION_OPTIONS);
};
