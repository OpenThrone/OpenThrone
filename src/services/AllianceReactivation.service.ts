import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  lockAllianceThenUsers,
} from '@/services/AllianceBank.service';
import { resumeLoansAfterReserve } from '@/services/AllianceLoan.service';
import { isAllianceActive } from '@/services/allianceStatus';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import { logActionStrict } from '@/utils/auditLogger';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { getLevelFromXP } from '@/utils/utilities';

/** Defaults mirror the runtime settings registry (#13). */
export const DEFAULT_REACTIVATION_MIN_LEVEL = 10;
export const DEFAULT_REACTIVATION_COST_GOLD = 10_000_000;

/** Refusal shown to the leader; the message is safe to show players. */
export class AllianceReactivationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'NOT_LEADER'
      | 'NOT_IN_ERA'
      | 'LEVEL_TOO_LOW'
      | 'INSUFFICIENT_GOLD',
  ) {
    super(message);
    this.name = 'AllianceReactivationError';
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Players holding active contracts lent by this alliance. A status change
 * adds or removes those troops from their battle strength, so the caller locks
 * these players with the alliance and then refreshes their stored stats.
 */
export const forceBorrowerIds = async (
  tx: Tx,
  allianceId: number,
): Promise<number[]> => {
  const rows = await tx.forceContract.findMany({
    where: { allianceId, status: 'ACTIVE' },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((row) => row.userId).sort((a, b) => a - b);
};

/** Refreshes stored strength after an alliance's forces started or stopped counting. */
export const refreshBorrowerStats = async (tx: Tx, userIds: number[]) => {
  for (const userId of userIds) await recomputeStoredStatsInTx(tx, userId);
};

/**
 * Staff override of an alliance's status (#13), inside the caller's
 * transaction (era lifecycle shared lock held). Locks the alliance and the
 * players holding its lent troops, flips the status, and refreshes their
 * stored strength. Reserving changes nothing else (the treasury, loans and
 * wars have their own admin actions); every gate already ignores a reserved
 * alliance. Reactivating costs nothing and resumes the held loans.
 */
export const setAllianceStatusAsAdmin = async (
  tx: Tx,
  allianceId: number,
  target: 'ACTIVE' | 'RESERVED',
  adminUserId: number,
): Promise<{ previousStatus: string; status: string }> => {
  // Alliance lock first, then enumerate and lock borrowers: a concurrent
  // force-loan approval either commits before the enumeration (and is seen) or
  // waits on the alliance lock and is refused as reserved.
  await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
  const borrowerIds = await forceBorrowerIds(tx, allianceId);
  await lockAllianceThenUsers(tx, allianceId, borrowerIds);
  const current = await tx.alliances.findUnique({
    where: { id: allianceId },
    select: { status: true, status_changed_at: true },
  });
  if (!current)
    throw new AllianceReactivationError('Alliance not found', 'NOT_FOUND');
  if (current.status === target)
    throw new AllianceReactivationError(
      target === 'RESERVED'
        ? 'The alliance is already reserved'
        : 'The alliance is already active',
      'NOT_FOUND',
    );
  const era = await tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
    select: { id: true },
  });
  await tx.alliances.update({
    where: { id: allianceId },
    data: {
      status: target,
      status_changed_at: new Date(),
      status_era_id: era?.id ?? null,
      status_changed_by: adminUserId,
    },
  });
  if (target === 'ACTIVE')
    await resumeLoansAfterReserve(tx, allianceId, current.status_changed_at);
  await refreshBorrowerStats(tx, borrowerIds);
  return { previousStatus: current.status, status: target };
};

export interface ReactivationRequirements {
  minLevel: number;
  costGold: number;
}

export const getReactivationRequirements =
  async (): Promise<ReactivationRequirements> => {
    const config = await getRuntimeConfig();
    return {
      minLevel:
        config.allianceReactivationMinLevel ?? DEFAULT_REACTIVATION_MIN_LEVEL,
      costGold:
        config.allianceReactivationCostGold ?? DEFAULT_REACTIVATION_COST_GOLD,
    };
  };

export interface ReactivationProgress {
  allianceId: number;
  status: string;
  requirements: ReactivationRequirements;
  /** The leader's standing against the requirements; only for the leader. */
  leader: {
    level: number;
    gold: string;
    inCurrentEra: boolean;
    meetsLevel: boolean;
    meetsGold: boolean;
  } | null;
  /** Leader only: every requirement is met right now. */
  canReactivate: boolean;
  statusChangedAt: string | null;
}

/**
 * Where a reserved alliance stands against its reactivation gate. Members get
 * the requirements; only the leader also gets their own standing.
 */
export async function getReactivationProgress(
  allianceId: number,
  viewerId: number,
): Promise<ReactivationProgress> {
  const [alliance, requirements, era] = await Promise.all([
    prisma.alliances.findUnique({
      where: { id: allianceId },
      select: {
        id: true,
        leader_id: true,
        status: true,
        status_changed_at: true,
      },
    }),
    getReactivationRequirements(),
    prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    }),
  ]);
  if (!alliance) {
    throw new AllianceReactivationError('Alliance not found', 'NOT_FOUND');
  }
  const base = {
    allianceId,
    status: alliance.status,
    requirements,
    statusChangedAt: alliance.status_changed_at?.toISOString() ?? null,
  };
  if (alliance.leader_id !== viewerId) {
    return { ...base, leader: null, canReactivate: false };
  }
  const leader = await prisma.users.findUnique({
    where: { id: viewerId },
    select: { experience: true, gold: true, currentEraId: true },
  });
  const level = getLevelFromXP(leader?.experience ?? 0);
  const gold = BigInt(leader?.gold ?? 0);
  const inCurrentEra = !!era && leader?.currentEraId === era.id;
  const meetsLevel = level >= requirements.minLevel;
  const meetsGold = gold >= BigInt(requirements.costGold);
  return {
    ...base,
    leader: {
      level,
      gold: gold.toString(),
      inCurrentEra,
      meetsLevel,
      meetsGold,
    },
    canReactivate:
      !isAllianceActive(alliance) && inCurrentEra && meetsLevel && meetsGold,
  };
}

export interface ReactivationResult {
  allianceId: number;
  /** False when the alliance was already ACTIVE: nothing was charged. */
  reactivated: boolean;
  paidGold: string;
}

/**
 * Leader-only reactivation of a RESERVED alliance (#13).
 *
 * One transaction under the era lifecycle (shared) and alliance -> leader row
 * locks, so two concurrent submits serialise: the first pays and flips the
 * alliance to ACTIVE, the second finds it ACTIVE and returns without charging.
 * The gold is spent (a sink), not paid to anyone. The audit row commits with
 * the change.
 */
export async function reactivateAlliance(input: {
  allianceId: number;
  actorId: number;
  ip?: string;
}): Promise<ReactivationResult> {
  const { allianceId, actorId } = input;
  return prisma.$transaction(async (tx) => {
    await lockEraLifecycleShared(tx);
    await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
    const borrowerIds = await forceBorrowerIds(tx, allianceId);
    await lockAllianceThenUsers(tx, allianceId, [actorId, ...borrowerIds]);
    const alliance = await tx.alliances.findUnique({
      where: { id: allianceId },
      select: {
        id: true,
        name: true,
        leader_id: true,
        status: true,
        status_changed_at: true,
      },
    });
    if (!alliance) {
      throw new AllianceReactivationError('Alliance not found', 'NOT_FOUND');
    }
    if (alliance.leader_id !== actorId) {
      throw new AllianceReactivationError(
        'Only the alliance leader can reactivate it',
        'NOT_LEADER',
      );
    }
    if (isAllianceActive(alliance)) {
      return { allianceId, reactivated: false, paidGold: '0' };
    }

    const requirements = await (async () => {
      const config = await getRuntimeConfig(tx);
      return {
        minLevel:
          config.allianceReactivationMinLevel ?? DEFAULT_REACTIVATION_MIN_LEVEL,
        costGold: BigInt(
          config.allianceReactivationCostGold ?? DEFAULT_REACTIVATION_COST_GOLD,
        ),
      };
    })();
    const era = await tx.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    const leader = await tx.users.findUnique({
      where: { id: actorId },
      select: { experience: true, currentEraId: true },
    });
    if (!era || !leader || leader.currentEraId !== era.id) {
      throw new AllianceReactivationError(
        'The leader must have entered the current era first',
        'NOT_IN_ERA',
      );
    }
    const level = getLevelFromXP(leader.experience);
    if (level < requirements.minLevel) {
      throw new AllianceReactivationError(
        `The leader must reach level ${requirements.minLevel} in this era (currently ${level})`,
        'LEVEL_TOO_LOW',
      );
    }
    // Conditional debit under the user row lock: concurrent spends of the
    // same gold cannot overdraw.
    const debit = await tx.users.updateMany({
      where: { id: actorId, gold: { gte: requirements.costGold } },
      data: { gold: { decrement: requirements.costGold } },
    });
    if (debit.count !== 1) {
      throw new AllianceReactivationError(
        `Reactivation costs ${requirements.costGold.toString()} gold on hand`,
        'INSUFFICIENT_GOLD',
      );
    }
    const flipped = await tx.alliances.updateMany({
      where: { id: allianceId, status: 'RESERVED' },
      data: {
        status: 'ACTIVE',
        status_changed_at: new Date(),
        status_era_id: era.id,
        status_changed_by: actorId,
      },
    });
    if (flipped.count !== 1) {
      // Lost a race despite the row lock: undo the charge by failing the tx.
      throw new Error('Alliance status changed; reload and retry');
    }
    // Held loans resume (due dates move out by the reserved time) and lent
    // troops count again.
    await resumeLoansAfterReserve(tx, allianceId, alliance.status_changed_at);
    await refreshBorrowerStats(tx, borrowerIds);
    await logActionStrict(
      {
        userId: actorId,
        action: 'ALLIANCE_REACTIVATED',
        ip: input.ip ?? 'unknown',
        entityType: 'Alliance',
        entityId: allianceId,
        details: {
          allianceName: alliance.name,
          eraId: era.id,
          paidGold: requirements.costGold.toString(),
          minLevel: requirements.minLevel,
          leaderLevel: level,
        },
      },
      tx,
    );
    return {
      allianceId,
      reactivated: true,
      paidGold: requirements.costGold.toString(),
    };
  }, ALLIANCE_BANK_TX_OPTIONS);
}
