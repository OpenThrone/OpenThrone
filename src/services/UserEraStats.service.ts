import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

export type StatsTableRow = {
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

export type EraDateRange = {
  startDate: Date;
  endDate: Date;
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

/**
 * Resolve attacker losses for a single attack_log row.
 * Prefers the scalar `attacker_losses_total` column when present, and falls
 * back to parsing the legacy `stats.attacker_losses.total` JSON path.
 * Mirrors the parsing approach used in AttackDataService.
 */
const resolveAttackerLosses = (attack: {
  attacker_losses_total?: number | null;
  stats?: unknown;
}): number => {
  if (typeof attack.attacker_losses_total === 'number') {
    return attack.attacker_losses_total;
  }
  const total = (
    attack.stats as { attacker_losses?: { total?: number } } | null | undefined
  )?.attacker_losses?.total;
  return typeof total === 'number' ? total : 0;
};

const resolveDefenderLosses = (attack: {
  defender_losses_total?: number | null;
  stats?: unknown;
}): number => {
  if (typeof attack.defender_losses_total === 'number') {
    return attack.defender_losses_total;
  }
  const total = (
    attack.stats as { defender_losses?: { total?: number } } | null | undefined
  )?.defender_losses?.total;
  return typeof total === 'number' ? total : 0;
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
export async function getTopHistoricalStandings(
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

export async function getTopHistoricalGoldOnHand(
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

export async function getTopHistoricalGoldInBank(
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

export async function getTopHistoricalOffense(
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

export async function getTopHistoricalDefense(
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

export async function getTopHistoricalSpy(
  eraId: number,
): Promise<StatsTableRow[]> {
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

export async function getTopHistoricalSentry(
  eraId: number,
): Promise<StatsTableRow[]> {
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

export async function getHistoricalTopSuccessfulAttackers(
  era: EraDateRange,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: {
        timestamp: { gte: era.startDate, lt: era.endDate },
        type: 'attack',
      },
      select: {
        attacker_id: true,
        winner: true,
      },
    });

    const counts: { [key: number]: number } = {};
    attacks.forEach((attack) => {
      if (attack.winner === attack.attacker_id) {
        counts[attack.attacker_id] = (counts[attack.attacker_id] || 0) + 1;
      }
    });

    const sorted = Object.entries(counts)
      .map(([attackerId, stat]) => ({
        attacker_id: parseInt(attackerId, 10),
        stat,
      }))
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);

    const detailed: (StatsTableRow | null)[] = await Promise.all(
      sorted.map(async ({ attacker_id, stat }) => {
        const user = await prisma.users.findUnique({
          where: { id: attacker_id },
          select: { id: true, display_name: true },
        });
        if (!user) return null;
        return {
          id: user.id,
          display_name: user.display_name,
          stat,
        };
      }),
    );

    return detailed.filter((row): row is StatsTableRow => row !== null);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopSuccessfulAttackers failed', err);
    return [];
  }
}

export async function getHistoricalTopAttackerCasualties(
  era: EraDateRange,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: {
        timestamp: { gte: era.startDate, lt: era.endDate },
      },
      include: {
        attackerPlayer: { select: { display_name: true } },
      },
    });

    const totals: { [key: number]: { display_name: string; stat: number } } =
      {};

    attacks.forEach((attack) => {
      const losses = resolveAttackerLosses(attack);
      if (!totals[attack.attacker_id]) {
        totals[attack.attacker_id] = {
          display_name: attack.attackerPlayer?.display_name ?? 'Unknown',
          stat: 0,
        };
      }
      totals[attack.attacker_id].stat += losses;
    });

    return Object.entries(totals)
      .map(([attackerId, value]) => ({
        id: parseInt(attackerId, 10),
        display_name: value.display_name,
        stat: value.stat,
      }))
      .sort((a, b) => Number(b.stat) - Number(a.stat))
      .slice(0, 10);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopAttackerCasualties failed', err);
    return [];
  }
}

export async function getHistoricalTopDefenderCasualties(
  era: EraDateRange,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: {
        timestamp: { gte: era.startDate, lt: era.endDate },
      },
      include: {
        defenderPlayer: { select: { display_name: true } },
      },
    });

    const totals: { [key: number]: { display_name: string; stat: number } } =
      {};

    attacks.forEach((attack) => {
      const losses = resolveDefenderLosses(attack);
      if (!totals[attack.defender_id]) {
        totals[attack.defender_id] = {
          display_name: attack.defenderPlayer?.display_name ?? 'Unknown',
          stat: 0,
        };
      }
      totals[attack.defender_id].stat += losses;
    });

    return Object.entries(totals)
      .map(([defenderId, value]) => ({
        id: parseInt(defenderId, 10),
        display_name: value.display_name,
        stat: value.stat,
      }))
      .sort((a, b) => Number(b.stat) - Number(a.stat))
      .slice(0, 10);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopDefenderCasualties failed', err);
    return [];
  }
}

export async function getHistoricalTopAttacksByTotalCasualties(
  era: EraDateRange,
): Promise<StatsTableRow[]> {
  try {
    const attacks = await prisma.attack_log.findMany({
      where: {
        timestamp: { gte: era.startDate, lt: era.endDate },
      },
      include: {
        attackerPlayer: { select: { display_name: true } },
        defenderPlayer: { select: { display_name: true } },
      },
    });

    return attacks
      .map((attack) => {
        const total =
          resolveAttackerLosses(attack) + resolveDefenderLosses(attack);
        return {
          display_name: `${attack.attackerPlayer?.display_name ?? 'Unknown'} vs ${attack.defenderPlayer?.display_name ?? 'Unknown'}`,
          stat: total,
        };
      })
      .sort((a, b) => b.stat - a.stat)
      .slice(0, 10);
  } catch (err) {
    logError(
      'UserEraStats.getHistoricalTopAttacksByTotalCasualties failed',
      err,
    );
    return [];
  }
}

export async function getHistoricalTopRecruiters(
  era: EraDateRange,
): Promise<StatsTableRow[]> {
  try {
    const grouped = await prisma.recruit_history.groupBy({
      by: ['to_user'],
      _count: { to_user: true },
      where: {
        timestamp: { gte: era.startDate, lt: era.endDate },
        from_user: { not: 0 },
        to_user: { not: 0 },
      },
      orderBy: { _count: { to_user: 'desc' } },
      take: 10,
    });

    // groupBy cannot express `from_user !== to_user`, so re-count each
    // candidate from the raw rows before resolving display names.
    const withValidCounts = await Promise.all(
      grouped.map(async (entry) => {
        const validRecords = await prisma.recruit_history.findMany({
          where: {
            timestamp: { gte: era.startDate, lt: era.endDate },
            to_user: entry.to_user,
            from_user: { not: entry.to_user },
          },
          select: { from_user: true, to_user: true, timestamp: true },
        });
        return {
          to_user: entry.to_user,
          stat: validRecords.length,
        };
      }),
    );

    const withNames: (StatsTableRow | null)[] = await Promise.all(
      withValidCounts
        .filter((entry) => entry.stat > 0)
        .map(async (entry) => {
          const user = await prisma.users.findFirst({
            where: { AND: [{ id: entry.to_user }, { id: { not: 0 } }] },
            select: { id: true, display_name: true },
          });
          if (!user) return null;
          return {
            id: user.id,
            display_name: user.display_name,
            stat: entry.stat,
          };
        }),
    );

    return withNames
      .filter((row): row is StatsTableRow => row !== null)
      .sort((a, b) => {
        if (Number(b.stat) !== Number(a.stat)) {
          return Number(b.stat) - Number(a.stat);
        }
        return a.display_name.localeCompare(b.display_name);
      })
      .slice(0, 10);
  } catch (err) {
    logError('UserEraStats.getHistoricalTopRecruiters failed', err);
    return [];
  }
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

    const results = await Promise.allSettled([
      getTopHistoricalStandings(eraId),
      getHistoricalTopRecruiters(eraRange),
      getHistoricalTopSuccessfulAttackers(eraRange),
      getTopHistoricalGoldOnHand(eraId),
      getTopHistoricalGoldInBank(eraId),
      getTopHistoricalOffense(eraId),
      getTopHistoricalDefense(eraId),
      getTopHistoricalSpy(eraId),
      getTopHistoricalSentry(eraId),
      getHistoricalTopAttackerCasualties(eraRange),
      getHistoricalTopDefenderCasualties(eraRange),
      getHistoricalTopAttacksByTotalCasualties(eraRange),
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
