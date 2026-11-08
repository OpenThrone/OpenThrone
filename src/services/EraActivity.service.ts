import type { Prisma } from '@/lib/prisma-exports';

import {
  type EraTopBattle,
  mergeTopBattles,
  parseTopBattles,
} from './EraActivityTypes';
import {
  resolveAttackerLosses,
  resolveDefenderLosses,
} from './UserEraStats.service';

type EraWindow = { id: number; startDate: Date; endDate: Date | null };

type ExpiringAttack = {
  attacker_id: number;
  defender_id: number;
  winner: number;
  type: string;
  timestamp: Date;
  attacker_losses_total?: number | null;
  defender_losses_total?: number | null;
  stats?: unknown;
};

type ExpiringRecruit = { from_user: number; to_user: number; timestamp: Date };

export type ActivityTotals = {
  userId: number;
  eraId: number;
  attacksWon: number;
  defendsWon: number;
  attackerCasualties: number;
  defenderCasualties: number;
  recruits: number;
};

const findEra = (eras: EraWindow[], at: Date) =>
  eras.find(
    (era) => at >= era.startDate && (era.endDate === null || at < era.endDate),
  );

/** Totals per player and top battles per era from the given log rows. */
export function tallyEraActivity(
  eras: EraWindow[],
  attacks: ExpiringAttack[],
  recruits: ExpiringRecruit[],
) {
  const totals = new Map<string, ActivityTotals>();
  const battles = new Map<number, EraTopBattle[]>();

  const totalsFor = (userId: number, eraId: number) => {
    const key = `${eraId}:${userId}`;
    const existing = totals.get(key);
    if (existing) return existing;
    const created: ActivityTotals = {
      userId,
      eraId,
      attacksWon: 0,
      defendsWon: 0,
      attackerCasualties: 0,
      defenderCasualties: 0,
      recruits: 0,
    };
    totals.set(key, created);
    return created;
  };

  for (const attack of attacks) {
    const era = findEra(eras, attack.timestamp);
    if (!era) continue;
    const attackerLosses = resolveAttackerLosses(attack);
    const defenderLosses = resolveDefenderLosses(attack);
    const attacker = totalsFor(attack.attacker_id, era.id);
    const defender = totalsFor(attack.defender_id, era.id);
    attacker.attackerCasualties += attackerLosses;
    defender.defenderCasualties += defenderLosses;
    if (attack.type === 'attack') {
      if (attack.winner === attack.attacker_id) attacker.attacksWon += 1;
      if (attack.winner === attack.defender_id) defender.defendsWon += 1;
    }
    const casualties = attackerLosses + defenderLosses;
    if (casualties > 0) {
      battles.set(era.id, [
        ...(battles.get(era.id) ?? []),
        {
          attackerId: attack.attacker_id,
          defenderId: attack.defender_id,
          casualties,
        },
      ]);
    }
  }

  for (const recruit of recruits) {
    if (recruit.from_user === recruit.to_user) continue;
    const era = findEra(eras, recruit.timestamp);
    if (era) totalsFor(recruit.to_user, era.id).recruits += 1;
  }

  return { totals: [...totals.values()], battles };
}

/**
 * Folds logs older than `cutoff` into the era totals. Call this in the same
 * transaction that deletes those logs, so each row is counted exactly once.
 * Battles that were voided are left out, as they are from every leaderboard.
 */
export async function rollUpExpiringActivity(
  tx: Prisma.TransactionClient,
  cutoff: Date,
): Promise<void> {
  const [eras, attacks, recruits] = await Promise.all([
    tx.era.findMany({
      select: { id: true, startDate: true, endDate: true, topBattles: true },
    }),
    tx.attack_log.findMany({
      where: { timestamp: { lt: cutoff }, voidedAt: null },
      select: {
        attacker_id: true,
        defender_id: true,
        winner: true,
        type: true,
        timestamp: true,
        attacker_losses_total: true,
        defender_losses_total: true,
        stats: true,
      },
    }),
    tx.recruit_history.findMany({
      where: {
        timestamp: { lt: cutoff },
        from_user: { not: 0 },
        to_user: { not: 0 },
      },
      select: { from_user: true, to_user: true, timestamp: true },
    }),
  ]);

  const { totals, battles } = tallyEraActivity(eras, attacks, recruits);

  const players = await tx.users.findMany({
    where: { id: { in: [...new Set(totals.map(({ userId }) => userId))] } },
    select: { id: true },
  });
  const playerIds = new Set(players.map(({ id }) => id));

  for (const { userId, eraId, ...counts } of totals) {
    if (!playerIds.has(userId)) continue;
    const values = {
      attacksWon: counts.attacksWon,
      defendsWon: counts.defendsWon,
      attackerCasualties: BigInt(counts.attackerCasualties),
      defenderCasualties: BigInt(counts.defenderCasualties),
      recruits: counts.recruits,
    };
    await tx.userEraActivity.upsert({
      where: { userId_eraId: { userId, eraId } },
      create: { userId, eraId, ...values },
      update: {
        attacksWon: { increment: values.attacksWon },
        defendsWon: { increment: values.defendsWon },
        attackerCasualties: { increment: values.attackerCasualties },
        defenderCasualties: { increment: values.defenderCasualties },
        recruits: { increment: values.recruits },
      },
    });
  }

  for (const [eraId, eraBattles] of battles) {
    const stored = eras.find(({ id }) => id === eraId)?.topBattles;
    await tx.era.update({
      where: { id: eraId },
      data: {
        topBattles: mergeTopBattles(parseTopBattles(stored), eraBattles),
      },
    });
  }
}
