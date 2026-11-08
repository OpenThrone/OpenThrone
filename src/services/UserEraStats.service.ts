import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

import {
  type EraTopBattle,
  mergeTopBattles,
  parseTopBattles,
} from './EraActivityTypes';

type StatsTableRow = {
  id?: number;
  display_name: string;
  stat: string | number;
};

export type EraTabOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
};

type EraDateRange = {
  startDate: Date;
  endDate: Date;
};

type EraRollup = {
  players: {
    userId: number;
    attacksWon: number;
    attackerCasualties: bigint;
    defenderCasualties: bigint;
    recruits: number;
  }[];
  topBattles: EraTopBattle[];
};

export type HistoricalEraStatsPayload = {
  era: EraTabOption;
  standings: StatsTableRow[];
  recruits: StatsTableRow[];
  attacks: StatsTableRow[];
  goldOnHand: StatsTableRow[];
  goldInBank: StatsTableRow[];
  offense: StatsTableRow[];
  defense: StatsTableRow[];
  spy: StatsTableRow[];
  sentry: StatsTableRow[];
  attackerCas: StatsTableRow[];
  defenderCas: StatsTableRow[];
  attackByCas: StatsTableRow[];
  lastGenerated: string;
};

/** Read both object and stringified legacy loss payloads. */
const resolveLegacyLosses = (stats: unknown, side: string): number => {
  if (!stats || typeof stats !== 'object') return 0;
  let losses: unknown = (stats as Record<string, unknown>)[side];
  if (typeof losses === 'string') {
    try {
      losses = JSON.parse(losses);
    } catch {
      return 0;
    }
  }
  if (!losses || typeof losses !== 'object') return 0;
  const { total } = losses as Record<string, unknown>;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
};

/**
 * Resolve attacker losses for a single attack_log row.
 * Prefers the scalar `attacker_losses_total` column when present, and falls
 * back to parsing the legacy `stats.attacker_losses.total` JSON path.
 * Shared by current and historical leaderboards.
 */
export const resolveAttackerLosses = (attack: {
  attacker_losses_total?: number | null;
  stats?: unknown;
}): number => {
  if (typeof attack.attacker_losses_total === 'number') {
    return attack.attacker_losses_total;
  }
  return resolveLegacyLosses(attack.stats, 'attacker_losses');
};

export const resolveDefenderLosses = (attack: {
  defender_losses_total?: number | null;
  stats?: unknown;
}): number => {
  if (typeof attack.defender_losses_total === 'number') {
    return attack.defender_losses_total;
  }
  return resolveLegacyLosses(attack.stats, 'defender_losses');
};

export async function getPublicEraTabs(): Promise<EraTabOption[]> {
  try {
    const eras = await prisma.era.findMany({
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    });

    return eras.map((era) => ({
      id: era.id,
      name: era.name,
      startDate: era.startDate.toISOString(),
      endDate: era.endDate ? era.endDate.toISOString() : null,
      isCurrent: era.endDate === null,
    }));
  } catch (err) {
    logError('UserEraStats.getPublicEraTabs failed', err);
    return [];
  }
}

/**
 * Historical overall standings for an era.
 *
 * `rankAtEnd` is intentionally NOT used (stale/unmaintained). Instead we derive
 * a composite score from end-of-era fighting stats: offense + defense + spy +
 * sentry. Ties are broken by total gold (on hand + bank) descending, then by
 * userId ascending.
 */
async function getTopHistoricalStandings(
  eraId: number,
): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
      },
      include: {
        user: {
          select: { id: true, display_name: true },
        },
      },
    });

    const scored = rows.map((row) => {
      const score =
        (row.offenseAtEnd ?? 0) +
        (row.defenseAtEnd ?? 0) +
        (row.spyAtEnd ?? 0) +
        (row.sentryAtEnd ?? 0);
      const gold = (row.goldAtEnd ?? 0n) + (row.goldInBankAtEnd ?? 0n);
      return {
        id: row.user.id,
        display_name: row.user.display_name,
        stat: score,
        gold,
        userId: row.userId,
      };
    });

    scored.sort((a, b) => {
      if (b.stat !== a.stat) return b.stat - a.stat;
      if (b.gold > a.gold) return 1;
      if (b.gold < a.gold) return -1;
      return a.userId - b.userId;
    });

    return scored.slice(0, 10).map(({ id, display_name, stat }) => ({
      id,
      display_name,
      stat,
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalStandings failed', err);
    return [];
  }
}

async function getTopHistoricalGoldOnHand(
  eraId: number,
): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
        goldAtEnd: { not: null },
      },
      include: {
        user: { select: { id: true, display_name: true } },
      },
      orderBy: { goldAtEnd: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      id: row.user.id,
      display_name: row.user.display_name,
      stat: (row.goldAtEnd ?? 0n).toString(),
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalGoldOnHand failed', err);
    return [];
  }
}

async function getTopHistoricalGoldInBank(
  eraId: number,
): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
        goldInBankAtEnd: { not: null },
      },
      include: {
        user: { select: { id: true, display_name: true } },
      },
      orderBy: { goldInBankAtEnd: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      id: row.user.id,
      display_name: row.user.display_name,
      stat: (row.goldInBankAtEnd ?? 0n).toString(),
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalGoldInBank failed', err);
    return [];
  }
}

async function getTopHistoricalOffense(
  eraId: number,
): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
        offenseAtEnd: { not: null },
      },
      include: {
        user: { select: { id: true, display_name: true } },
      },
      orderBy: { offenseAtEnd: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      id: row.user.id,
      display_name: row.user.display_name,
      stat: row.offenseAtEnd ?? 0,
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalOffense failed', err);
    return [];
  }
}

async function getTopHistoricalDefense(
  eraId: number,
): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
        defenseAtEnd: { not: null },
      },
      include: {
        user: { select: { id: true, display_name: true } },
      },
      orderBy: { defenseAtEnd: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      id: row.user.id,
      display_name: row.user.display_name,
      stat: row.defenseAtEnd ?? 0,
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalDefense failed', err);
    return [];
  }
}

async function getTopHistoricalSpy(eraId: number): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
        spyAtEnd: { not: null },
      },
      include: {
        user: { select: { id: true, display_name: true } },
      },
      orderBy: { spyAtEnd: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      id: row.user.id,
      display_name: row.user.display_name,
      stat: row.spyAtEnd ?? 0,
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalSpy failed', err);
    return [];
  }
}

async function getTopHistoricalSentry(eraId: number): Promise<StatsTableRow[]> {
  try {
    const rows = await prisma.userEra.findMany({
      where: {
        eraId,
        userId: { not: 0 },
        sentryAtEnd: { not: null },
      },
      include: {
        user: { select: { id: true, display_name: true } },
      },
      orderBy: { sentryAtEnd: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      id: row.user.id,
      display_name: row.user.display_name,
      stat: row.sentryAtEnd ?? 0,
    }));
  } catch (err) {
    logError('UserEraStats.getTopHistoricalSentry failed', err);
    return [];
  }
}

/** Top 10 of `totals`, named, ties broken by name. */
async function toNamedRows(
  totals: Map<number, number>,
): Promise<StatsTableRow[]> {
  const top = [...totals.entries()]
    .filter(([, stat]) => stat > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const names = await getDisplayNames(top.map(([id]) => id));
  return top
    .flatMap(([id, stat]): StatsTableRow[] => {
      const display_name = names.get(id);
      return display_name ? [{ id, display_name, stat }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.stat) - Number(a.stat) ||
        a.display_name.localeCompare(b.display_name),
    );
}

async function getDisplayNames(ids: number[]): Promise<Map<number, string>> {
  const users = await prisma.users.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, display_name: true },
  });
  return new Map(users.map(({ id, display_name }) => [id, display_name]));
}

const addTo = (totals: Map<number, number>, id: number, amount: number) => {
  totals.set(id, (totals.get(id) ?? 0) + amount);
};

const eraWindow = (era: EraDateRange) => ({
  gte: era.startDate,
  lt: era.endDate,
});

async function getHistoricalTopSuccessfulAttackers(
  era: EraDateRange,
  rollup: EraRollup,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: { voidedAt: null, timestamp: eraWindow(era), type: 'attack' },
      select: { attacker_id: true, winner: true },
    });
    const totals = new Map<number, number>();
    for (const { attacker_id, winner } of attacks) {
      if (winner === attacker_id) addTo(totals, attacker_id, 1);
    }
    for (const { userId, attacksWon } of rollup.players) {
      addTo(totals, userId, attacksWon);
    }
    return await toNamedRows(totals);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopSuccessfulAttackers failed', err);
    return [];
  }
}

const LOSS_FIELDS = {
  attacker_id: true,
  defender_id: true,
  attacker_losses_total: true,
  defender_losses_total: true,
  stats: true,
} as const;

async function getHistoricalTopAttackerCasualties(
  era: EraDateRange,
  rollup: EraRollup,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: { voidedAt: null, timestamp: eraWindow(era) },
      select: LOSS_FIELDS,
    });
    const totals = new Map<number, number>();
    for (const attack of attacks) {
      addTo(totals, attack.attacker_id, resolveAttackerLosses(attack));
    }
    for (const { userId, attackerCasualties } of rollup.players) {
      addTo(totals, userId, Number(attackerCasualties));
    }
    return await toNamedRows(totals);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopAttackerCasualties failed', err);
    return [];
  }
}

async function getHistoricalTopDefenderCasualties(
  era: EraDateRange,
  rollup: EraRollup,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: { voidedAt: null, timestamp: eraWindow(era) },
      select: LOSS_FIELDS,
    });
    const totals = new Map<number, number>();
    for (const attack of attacks) {
      addTo(totals, attack.defender_id, resolveDefenderLosses(attack));
    }
    for (const { userId, defenderCasualties } of rollup.players) {
      addTo(totals, userId, Number(defenderCasualties));
    }
    return await toNamedRows(totals);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopDefenderCasualties failed', err);
    return [];
  }
}

async function getHistoricalTopAttacksByTotalCasualties(
  era: EraDateRange,
  rollup: EraRollup,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: { voidedAt: null, timestamp: eraWindow(era) },
      select: LOSS_FIELDS,
    });
    const battles = mergeTopBattles(
      rollup.topBattles,
      attacks.map((attack) => ({
        attackerId: attack.attacker_id,
        defenderId: attack.defender_id,
        casualties:
          resolveAttackerLosses(attack) + resolveDefenderLosses(attack),
      })),
    );
    const names = await getDisplayNames(
      battles.flatMap(({ attackerId, defenderId }) => [attackerId, defenderId]),
    );
    return battles.map(({ attackerId, defenderId, casualties }) => ({
      display_name: `${names.get(attackerId) ?? 'Unknown'} vs ${names.get(defenderId) ?? 'Unknown'}`,
      stat: casualties,
    }));
  } catch (err) {
    logError(
      'UserEraStats.getHistoricalTopAttacksByTotalCasualties failed',
      err,
    );
    return [];
  }
}

async function getHistoricalTopRecruiters(
  era: EraDateRange,
  rollup: EraRollup,
): Promise<StatsTableRow[]> {
  try {
    const records = await prisma.recruit_history.findMany({
      where: {
        timestamp: eraWindow(era),
        from_user: { not: 0 },
        to_user: { not: 0 },
      },
      select: { from_user: true, to_user: true },
    });
    const totals = new Map<number, number>();
    for (const { from_user, to_user } of records) {
      if (from_user !== to_user) addTo(totals, to_user, 1);
    }
    for (const { userId, recruits } of rollup.players) {
      addTo(totals, userId, recruits);
    }
    return await toNamedRows(totals);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopRecruiters failed', err);
    return [];
  }
}

/** Totals for logs that have already expired from this era. */
async function loadEraRollup(
  eraId: number,
  storedBattles: unknown,
): Promise<EraRollup> {
  const players = await prisma.userEraActivity.findMany({ where: { eraId } });
  return { players, topBattles: parseTopBattles(storedBattles) };
}

/**
 * Assembles the full historical stats payload for a PAST era.
 *
 * Returns null when the era does not exist or is still active
 * (endDate === null): this module is historical-only. Sub-queries run in
 * parallel via Promise.allSettled so a single failing stat is logged and
 * downgraded to an empty array instead of failing the whole payload.
 */
export async function getHistoricalEraStats(
  eraId: number,
): Promise<HistoricalEraStatsPayload | null> {
  try {
    const era = await prisma.era.findUnique({ where: { id: eraId } });
    if (!era) return null;
    if (era.endDate === null) return null;

    const eraRange: EraDateRange = {
      startDate: era.startDate,
      endDate: era.endDate,
    };

    const eraTab: EraTabOption = {
      id: era.id,
      name: era.name,
      startDate: era.startDate.toISOString(),
      endDate: era.endDate.toISOString(),
      isCurrent: false,
    };

    const rollup = await loadEraRollup(eraId, era.topBattles);

    const results = await Promise.allSettled([
      getTopHistoricalStandings(eraId),
      getHistoricalTopRecruiters(eraRange, rollup),
      getHistoricalTopSuccessfulAttackers(eraRange, rollup),
      getTopHistoricalGoldOnHand(eraId),
      getTopHistoricalGoldInBank(eraId),
      getTopHistoricalOffense(eraId),
      getTopHistoricalDefense(eraId),
      getTopHistoricalSpy(eraId),
      getTopHistoricalSentry(eraId),
      getHistoricalTopAttackerCasualties(eraRange, rollup),
      getHistoricalTopDefenderCasualties(eraRange, rollup),
      getHistoricalTopAttacksByTotalCasualties(eraRange, rollup),
    ]);

    const settled = <T>(r: PromiseSettledResult<T>, fallback: T): T => {
      if (r.status === 'fulfilled') return r.value;
      logError(
        'UserEraStats.getHistoricalEraStats sub-query rejected',
        r.reason,
      );
      return fallback;
    };

    return {
      era: eraTab,
      standings: settled(results[0], []),
      recruits: settled(results[1], []),
      attacks: settled(results[2], []),
      goldOnHand: settled(results[3], []),
      goldInBank: settled(results[4], []),
      offense: settled(results[5], []),
      defense: settled(results[6], []),
      spy: settled(results[7], []),
      sentry: settled(results[8], []),
      attackerCas: settled(results[9], []),
      defenderCas: settled(results[10], []),
      attackByCas: settled(results[11], []),
      lastGenerated: new Date().toISOString(),
    };
  } catch (err) {
    logError('UserEraStats.getHistoricalEraStats failed', err);
    return null;
  }
}
