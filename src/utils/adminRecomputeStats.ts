import type { Prisma } from '@/lib/prisma-exports';
import { contractRoster } from '@/services/Mercenary.service';
import { calculateUserStats } from '@/utils/utilities';

export type StoredStrength = {
  offense: number;
  defense: number;
  spy: number;
  sentry: number;
  killingStrength: number;
  defenseStrength: number;
};

/**
 * Recomputes a player's stored strength columns inside `tx`, using the same
 * roster gameplay does (AttackDataService.getUserById): owned UserUnit rows
 * plus active current-era contract troops minus their wounds. Persists
 * offense/defense/spy/sentry and killing_str/defense_str and returns them.
 * Call after any write that changes units, items, upgrades, fort, level,
 * race or class; the caller owns locking. `strengthOnly` writes only
 * killing_str/defense_str, for combat, which stores the other four itself.
 */
export async function recomputeStoredStatsInTx(
  tx: Prisma.TransactionClient,
  userId: number,
  now = new Date(),
  { strengthOnly = false }: { strengthOnly?: boolean } = {},
): Promise<StoredStrength> {
  const user = await tx.users.findUnique({
    where: { id: userId },
    include: {
      UserUnit: true,
      UserItem: true,
      UserStructureUpgrade: true,
      UserBattleUpgrade: true,
      UserBonusPoints: true,
      forceContracts: {
        where: { status: 'ACTIVE', expiresAt: { gt: now } },
      },
    },
  });
  if (!user) throw new Error(`User ${userId} not found`);
  const roster = [
    ...(user.UserUnit ?? []),
    ...contractRoster(
      (user.forceContracts ?? []).filter(
        (contract) => (contract.eraId ?? null) === (user.currentEraId ?? null),
      ),
      user.wounded_units,
      now,
    ),
  ];
  // UserModel reads UserUnit, so the roster must replace it, not sit beside it.
  const stats = calculateUserStats(
    { ...user, UserUnit: roster },
    roster,
    'units',
  );
  await tx.users.update({
    where: { id: userId },
    data: {
      killing_str: stats.killingStrength,
      defense_str: stats.defenseStrength,
      // Combat writes the four army stats from its own battle model.
      ...(strengthOnly
        ? {}
        : {
            offense: stats.newOffense,
            defense: stats.newDefense,
            spy: stats.newSpying,
            sentry: stats.newSentry,
          }),
    },
  });
  return {
    offense: stats.newOffense,
    defense: stats.newDefense,
    spy: stats.newSpying,
    sentry: stats.newSentry,
    killingStrength: stats.killingStrength,
    defenseStrength: stats.defenseStrength,
  };
}
