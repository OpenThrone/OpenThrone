import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { evictUserFromChatRoom } from '@/lib/socket';
import { AllianceService } from '@/services/Alliance.service';
import { reserveAlliancesForEraBoundary } from '@/services/allianceStatus';
import { CaptiveService } from '@/services/Captives.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import {
  buildDefaultUserUpdate,
  buildEraStartOverrides,
  resetUserRelations,
} from '@/services/UserDefaults.service';
import { logActionStrict } from '@/utils/auditLogger';
import {
  ERA_TRANSACTION_OPTIONS,
  lockEraLifecycle,
} from '@/utils/eraLifecycleLock';
import { eraResetPhrase } from '@/utils/eraResetPhrase';
import {
  type EraStartSettings,
  resolveEraStartSettings,
} from '@/utils/eraStartSettings';

type Tx = Prisma.TransactionClient;

export class CurrentEraResetError extends Error {
  constructor(
    message: string,
    public readonly code: 'ERA_NOT_FOUND' | 'STALE_ERA' | 'LOGINS_ENABLED',
  ) {
    super(message);
    this.name = 'CurrentEraResetError';
  }
}

const booleanValue = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const isLoginDisabled = async (tx: Tx) => {
  const setting = await tx.serverSetting.findUnique({
    where: { key: 'DISABLE_LOGIN' },
    select: { value: true },
  });
  const fromDb = booleanValue(setting?.value);
  const rawEnv = process.env.NEXT_PUBLIC_DISABLE_LOGIN;
  const fromEnv =
    rawEnv === undefined ? false : rawEnv.toLowerCase() === 'true';
  return fromDb ?? fromEnv;
};

const enableLogins = async (tx: Tx, adminId: number) => {
  await tx.serverSetting.upsert({
    where: { key: 'DISABLE_LOGIN' },
    create: {
      key: 'DISABLE_LOGIN',
      label: 'Disable login',
      type: 'BOOLEAN',
      value: false,
      isPublic: true,
      updatedByUserId: adminId,
    },
    update: { value: false, updatedByUserId: adminId },
  });
};

/** Reset the in-progress era without creating a completed-era snapshot. */
export type CurrentEraResetInput = {
  eraId: number;
  expectedEraStartDate: Date;
  confirmation: string;
  enableLogins?: boolean;
  /** Starting values chosen for this reset; saved to the era. Defaults to the era's saved values. */
  startSettings?: EraStartSettings;
  adminUserId: number;
  ip: string;
  /**
   * Complete factory restore (#13): additionally dissolves every alliance.
   * Needs its own confirmation phrase; the ordinary reset keeps alliances.
   */
  factoryRestore?: boolean;
};

export async function resetCurrentEra(input: CurrentEraResetInput) {
  if (
    input.confirmation !== eraResetPhrase(input.eraId, input.factoryRestore)
  ) {
    throw new Error('Explicit confirmation is required');
  }
  const result = await prisma.$transaction(async (tx) => {
    await lockEraLifecycle(tx);
    return resetCurrentEraInTransaction(tx, input);
  }, ERA_TRANSACTION_OPTIONS);
  invalidateRuntimeConfigCache();
  // Chat evictions are socket pushes: only after the dissolution committed.
  result.chatEvictions.forEach(({ userId, roomId }) =>
    evictUserFromChatRoom(userId, roomId),
  );
  return result;
}

/** Caller must hold the era lifecycle lock for this transaction. */
export async function resetCurrentEraInTransaction(
  tx: Tx,
  input: CurrentEraResetInput,
) {
  if (
    input.confirmation !== eraResetPhrase(input.eraId, input.factoryRestore)
  ) {
    throw new Error('Explicit confirmation is required');
  }

  const currentEra = await tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
  });
  if (!currentEra)
    throw new CurrentEraResetError('No active era', 'ERA_NOT_FOUND');
  if (currentEra.id !== input.eraId) {
    throw new CurrentEraResetError('Active era changed', 'STALE_ERA');
  }
  if (currentEra.startDate.getTime() !== input.expectedEraStartDate.getTime()) {
    throw new CurrentEraResetError('Active era changed', 'STALE_ERA');
  }
  if (!(await isLoginDisabled(tx))) {
    throw new CurrentEraResetError('Logins must be disabled', 'LOGINS_ENABLED');
  }

  // Lock order everywhere else is alliance -> users: take the alliance rows
  // first so a bank/loan transaction cannot deadlock with this reset.
  let dissolved: {
    dissolved: number;
    evictions: { userId: number; roomId: number }[];
    alliances: { id: number; name: string }[];
  } = { dissolved: 0, evictions: [], alliances: [] };
  if (input.factoryRestore) {
    dissolved = await AllianceService.dissolveAllAlliancesForFactoryRestore(tx);
  } else {
    await tx.$queryRaw`SELECT id FROM alliances ORDER BY id FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM users WHERE id > 0 ORDER BY id FOR UPDATE`;
  const resetAt = new Date(
    Math.max(Date.now(), currentEra.startDate.getTime() + 1),
  );
  const startSettings =
    input.startSettings ?? resolveEraStartSettings(currentEra.startSettings);
  const startOverrides = buildEraStartOverrides(startSettings);
  const users = await tx.users.findMany({
    where: { id: { gt: 0 } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const user of users) {
    await resetUserRelations(tx, user.id, startSettings);
    await tx.users.update({
      where: { id: user.id },
      data: {
        ...buildDefaultUserUpdate(startOverrides),
        currentEraId: currentEra.id,
        rank: 0,
        stats: [],
        last_active: null,
        last_gameplay_at: null,
      },
    });
  }

  // These records have no era id; the active era's date window identifies discarded test-era activity.
  await tx.attack_log_acl.deleteMany({
    where: { attack_log: { timestamp: { gte: currentEra.startDate } } },
  });
  await tx.attack_log.deleteMany({
    where: { timestamp: { gte: currentEra.startDate } },
  });
  await tx.bank_history.deleteMany({
    where: { date_time: { gte: currentEra.startDate } },
  });
  await tx.recruit_history.deleteMany({
    where: { timestamp: { gte: currentEra.startDate } },
  });
  const pendingFriendRequests = await tx.bank_history.findMany({
    where: {
      history_type: 'FRIEND_REQUEST',
      stats: { path: ['transferType'], equals: 'FRIEND_REQUEST' },
    },
    select: { id: true, stats: true },
  });
  for (const request of pendingFriendRequests) {
    const stats =
      request.stats && typeof request.stats === 'object'
        ? (request.stats as Record<string, unknown>)
        : {};
    await tx.bank_history.update({
      where: { id: request.id },
      data: {
        stats: {
          ...stats,
          transferType: 'FRIEND_REQUEST_CANCELLED',
          cancelledAt: resetAt.toISOString(),
        },
      },
    });
  }
  await tx.alliance_bank_history.deleteMany({
    where: { created_at: { gte: currentEra.startDate } },
  });
  await tx.alliance_wars.deleteMany({
    where: {
      OR: [
        { created_at: { gte: currentEra.startDate } },
        { status: { in: ['WARMUP', 'ACTIVE', 'COOLDOWN'] } },
      ],
    },
  });
  await tx.alliance_join_requests.deleteMany({
    where: { created_at: { gte: currentEra.startDate } },
  });
  await tx.alliance_cooldowns.deleteMany({ where: {} });
  await tx.autoRecruitSession.deleteMany({ where: {} });
  await tx.userEra.deleteMany({ where: { eraId: currentEra.id } });
  await tx.userEraActivity.deleteMany({ where: { eraId: currentEra.id } });
  // Dungeon captives (#210) are all freed without returning; the reset wipes
  // every army anyway. The captive event ledger stays as history.
  await CaptiveService.clearCaptivesForEra(tx);
  await tx.responseCache.deleteMany({
    where: {
      key: {
        in: [
          `compareTop:${currentEra.id}:true`,
          `compareTop:${currentEra.id}:false`,
          `community:stats:history:era:${currentEra.id}:v1`,
        ],
      },
    },
  });

  // Alliance identity, roster, roles, and membership persist; era progression returns to baseline.
  await tx.forceDuesRule.updateMany({ data: { nextIssueAt: new Date() } });
  await tx.forceReserve.updateMany({
    data: { available: 0, woundedQuantity: 0, lastHealedAt: new Date() },
  });
  await tx.forceEvent.updateMany({
    where: { action: 'PILLAGE_PENDING' },
    data: { action: 'PILLAGE_CANCELLED' },
  });
  // Alliances survive an ordinary reset as RESERVED (treasury zeroed, loans
  // and wars closed, XP/upgrades cleared); a factory restore deleted them above.
  const allianceBoundary = await reserveAlliancesForEraBoundary(
    tx,
    currentEra.id,
  );
  await tx.era.update({
    where: { id: currentEra.id },
    data: {
      startDate: resetAt,
      startSettings: startSettings as Prisma.InputJsonValue,
      topBattles: [],
    },
  });

  if (input.enableLogins) await enableLogins(tx, input.adminUserId);
  if (input.factoryRestore) {
    await logActionStrict(
      {
        userId: input.adminUserId,
        action: 'ADMIN_FACTORY_RESTORE',
        ip: input.ip,
        entityType: 'Era',
        entityId: currentEra.id,
        details: {
          eraId: currentEra.id,
          alliancesDissolved: dissolved.dissolved,
          alliances: dissolved.alliances,
          usersReset: users.length,
        },
      },
      tx,
    );
  }
  await logActionStrict(
    {
      userId: input.adminUserId,
      action: 'ADMIN_CURRENT_ERA_RESET',
      ip: input.ip,
      entityType: 'Era',
      entityId: currentEra.id,
      details: {
        eraId: currentEra.id,
        previousStartDate: currentEra.startDate.toISOString(),
        resetStartDate: resetAt.toISOString(),
        startSettings,
        usersReset: users.length,
        loginsEnabled: !!input.enableLogins,
        factoryRestore: !!input.factoryRestore,
        alliancesReserved: allianceBoundary.reserved,
        alliancesDissolved: dissolved.dissolved,
      },
    },
    tx,
  );
  return {
    eraId: currentEra.id,
    startDate: resetAt,
    resetUserCount: users.length,
    loginEnabled: !!input.enableLogins,
    alliancesReserved: allianceBoundary.reserved,
    alliancesDissolved: dissolved.dissolved,
    chatEvictions: dissolved.evictions,
  };
}
