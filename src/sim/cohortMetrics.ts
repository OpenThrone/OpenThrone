import { calculateTurnIncome, getPlayerPower } from './economy';
import type { EraSimulationRunState } from './eraIntegration';
import type { FarmerVariant, Persona, ScenarioEvent } from './scenarioTypes';

export const ERA_CHECKPOINTS = [
  0, 1, 7, 14, 30, 60, 90, 180, 365, 545, 730,
] as const;

export interface QuantileSummary {
  readonly p05: number;
  readonly median: number;
  readonly p95: number;
}

/**
 * Per-cohort cumulative event counters attributed to cohort members across
 * the run-to-date. Sourced exclusively from the deterministic
 * `ScenarioEvent[]` stream; no synthetic counts.
 *
 * - `focusFireNominationsReceived` counts nominations where a cohort member
 *   was the nominated target (uses `targetId`).
 * - `recruitmentAwardGold` and `allianceAidGold` sum the `value` field
 *   (`RecruitmentAward` events store gold awarded; `AllianceAid` events
 *   store gold transferred).
 */
export interface CohortCumulativeEvents {
  readonly wipes: number;
  readonly recoveries: number;
  readonly reactivations: number;
  readonly adaptations: number;
  readonly focusFireNominationsReceived: number;
  readonly recruitmentAwardEvents: number;
  readonly recruitmentAwardGold: number;
  readonly allianceAidEvents: number;
  readonly allianceAidGold: number;
}

export interface CohortMetricRecord {
  readonly day: number;
  readonly cohortId: string;
  readonly persona: Persona;
  readonly activityClass: string;
  readonly count: number;
  readonly citizens: QuantileSummary;
  readonly workers: QuantileSummary;
  readonly handGold: QuantileSummary;
  readonly bankGold: QuantileSummary;
  readonly strategicPower: QuantileSummary;
  readonly income: QuantileSummary;
  readonly level: QuantileSummary;
  readonly viability: QuantileSummary;
  readonly fortLevel: QuantileSummary;
  readonly fortHp: QuantileSummary;
  readonly xp: QuantileSummary;
  readonly attackTurns: QuantileSummary;
  readonly stamina: QuantileSummary;
  readonly military: QuantileSummary;
  readonly spies: QuantileSummary;
  readonly sentries: QuantileSummary;
  readonly defensePressure: QuantileSummary;
  readonly spyPressure: QuantileSummary;
  /**
   * Same-day per-player population viability median. Stored denormalized on
   * every record for the same day so `evaluateBalanceGates` can use the
   * correct normalized reference. Mean of cohort medians is wrong because
   * a 1-player cohort and a 25-player cohort would weight equally.
   */
  readonly populationViabilityMedian: number;
  readonly farmerVariant?: FarmerVariant;
  readonly allianceIds?: readonly string[];
  readonly joinedOnDayRange?: readonly [number, number];
  readonly cumulativeEvents: CohortCumulativeEvents;
}

const EMPTY_QUANTILE: QuantileSummary = { p05: 0, median: 0, p95: 0 };

const ZERO_EVENTS: CohortCumulativeEvents = {
  wipes: 0,
  recoveries: 0,
  reactivations: 0,
  adaptations: 0,
  focusFireNominationsReceived: 0,
  recruitmentAwardEvents: 0,
  recruitmentAwardGold: 0,
  allianceAidEvents: 0,
  allianceAidGold: 0,
};

/**
 * Nearest-rank quantile. Sorts a defensive copy (caller's array is never
 * mutated) and returns the value at `ceil(percentile * n) - 1`, clamped to
 * the array bounds. Empty input throws: callers must guard empty cohorts
 * before invocation.
 */
export function nearestRank(
  values: readonly number[],
  percentile: number,
): number {
  if (values.length === 0)
    throw new Error('nearestRank requires at least one value');
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new Error(`percentile must be in [0, 1]; received ${percentile}`);
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function summarizeQuantiles(values: readonly number[]): QuantileSummary {
  if (values.length === 0) return EMPTY_QUANTILE;
  return {
    p05: nearestRank(values, 0.05),
    median: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
  };
}

/**
 * Composite viability = geometric mean of normalized income, combat power,
 * clandestine power, and level. Each axis is normalized against the same-day
 * per-player population median (epsilon 1 to keep the ratio finite when a
 * median is zero). Output is unity when every axis equals its median.
 */
export function compositeViability(input: {
  readonly income: number;
  readonly combatPower: number;
  readonly clandestinePower: number;
  readonly level: number;
  readonly populationMedians: {
    readonly income: number;
    readonly power: number;
    readonly clandestine: number;
    readonly level: number;
  };
}): number {
  const epsilon = 1;
  const normalized = [
    (Math.max(0, input.income) + epsilon) /
      (Math.max(0, input.populationMedians.income) + epsilon),
    (Math.max(0, input.combatPower) + epsilon) /
      (Math.max(0, input.populationMedians.power) + epsilon),
    (Math.max(0, input.clandestinePower) + epsilon) /
      (Math.max(0, input.populationMedians.clandestine) + epsilon),
    (Math.max(0, input.level) + epsilon) /
      (Math.max(0, input.populationMedians.level) + epsilon),
  ];
  return (
    normalized.reduce((product, value) => product * value, 1) **
    (1 / normalized.length)
  );
}

interface ClandestinePlayer {
  units: {
    spy: number;
    infiltrator: number;
    assassin: number;
    sentry: number;
    sentinel: number;
    inquisitor: number;
  };
}

export function clandestinePower(player: ClandestinePlayer): number {
  return (
    player.units.spy +
    player.units.infiltrator * 2 +
    player.units.assassin * 3 +
    player.units.sentry +
    player.units.sentinel * 2 +
    player.units.inquisitor * 3
  );
}

interface MilitaryPlayer {
  units: {
    soldier: number;
    knight: number;
    berserker: number;
    guard: number;
    archer: number;
    royalGuard: number;
  };
}

export function militaryHeadcount(player: MilitaryPlayer): number {
  return (
    player.units.soldier +
    player.units.knight +
    player.units.berserker +
    player.units.guard +
    player.units.archer +
    player.units.royalGuard
  );
}

interface SpyPlayer {
  units: {
    spy: number;
    infiltrator: number;
    assassin: number;
  };
}

export function spyHeadcount(player: SpyPlayer): number {
  return player.units.spy + player.units.infiltrator + player.units.assassin;
}

interface SentryPlayer {
  units: {
    sentry: number;
    sentinel: number;
    inquisitor: number;
  };
}

export function sentryHeadcount(player: SentryPlayer): number {
  return player.units.sentry + player.units.sentinel + player.units.inquisitor;
}

interface PlayerEventAccumulator {
  wipes: number;
  recoveries: number;
  reactivations: number;
  adaptations: number;
  focusFireNominationsReceived: number;
  recruitmentAwardEvents: number;
  recruitmentAwardGold: number;
  allianceAidEvents: number;
  allianceAidGold: number;
}

function emptyAccumulator(): PlayerEventAccumulator {
  return {
    wipes: 0,
    recoveries: 0,
    reactivations: 0,
    adaptations: 0,
    focusFireNominationsReceived: 0,
    recruitmentAwardEvents: 0,
    recruitmentAwardGold: 0,
    allianceAidEvents: 0,
    allianceAidGold: 0,
  };
}

/**
 * Builds per-player cumulative event accumulators from the deterministic
 * `ScenarioEvent[]` stream. Only events with `day <= upToDay` are counted,
 * so each checkpoint reflects run-to-date totals at that day. Both the
 * iteration order and the accumulator field order are stable, so two
 * identical inputs always produce identical outputs.
 */
function buildPlayerEventAccumulators(
  events: readonly ScenarioEvent[],
  upToDay: number,
): Map<string, PlayerEventAccumulator> {
  const byPlayer = new Map<string, PlayerEventAccumulator>();
  for (const event of events) {
    if (event.day > upToDay) continue;
    switch (event.kind) {
      case 'wipe': {
        const acc = byPlayer.get(event.actorId) ?? emptyAccumulator();
        acc.wipes += 1;
        byPlayer.set(event.actorId, acc);
        break;
      }
      case 'recovery': {
        const acc = byPlayer.get(event.actorId) ?? emptyAccumulator();
        acc.recoveries += 1;
        byPlayer.set(event.actorId, acc);
        break;
      }
      case 'reactivation': {
        const acc = byPlayer.get(event.actorId) ?? emptyAccumulator();
        acc.reactivations += 1;
        byPlayer.set(event.actorId, acc);
        break;
      }
      case 'adaptation': {
        const acc = byPlayer.get(event.actorId) ?? emptyAccumulator();
        acc.adaptations += 1;
        byPlayer.set(event.actorId, acc);
        break;
      }
      case 'focusFireNomination': {
        // actorId is the nominating alliance leader; targetId is the
        // nominated target. The gate cares about pressure received,
        // so attribute to targetId.
        if (!event.targetId) break;
        const acc = byPlayer.get(event.targetId) ?? emptyAccumulator();
        acc.focusFireNominationsReceived += 1;
        byPlayer.set(event.targetId, acc);
        break;
      }
      case 'recruitmentAward': {
        // `value` carries gold awarded per RecruitmentAward schema.
        const acc = byPlayer.get(event.actorId) ?? emptyAccumulator();
        acc.recruitmentAwardEvents += 1;
        acc.recruitmentAwardGold += event.value ?? 0;
        byPlayer.set(event.actorId, acc);
        break;
      }
      case 'allianceAid': {
        // actorId = leader (withdrawer), targetId = recipient. Gold flows
        // to recipient, so attribute the received aid to targetId.
        if (!event.targetId) break;
        const acc = byPlayer.get(event.targetId) ?? emptyAccumulator();
        acc.allianceAidEvents += 1;
        acc.allianceAidGold += event.value ?? 0;
        byPlayer.set(event.targetId, acc);
        break;
      }
      default:
        // Unknown event kinds are silently skipped; the switch is
        // exhaustive over the ScenarioEventKind union but the `default`
        // branch keeps the accumulator stable if new kinds are added.
        break;
    }
  }
  return byPlayer;
}

function sumAccumulators(
  accumulators: readonly PlayerEventAccumulator[],
): CohortCumulativeEvents {
  const total = emptyAccumulator();
  for (const acc of accumulators) {
    total.wipes += acc.wipes;
    total.recoveries += acc.recoveries;
    total.reactivations += acc.reactivations;
    total.adaptations += acc.adaptations;
    total.focusFireNominationsReceived += acc.focusFireNominationsReceived;
    total.recruitmentAwardEvents += acc.recruitmentAwardEvents;
    total.recruitmentAwardGold += acc.recruitmentAwardGold;
    total.allianceAidEvents += acc.allianceAidEvents;
    total.allianceAidGold += acc.allianceAidGold;
  }
  return total;
}

interface PopulationMedians {
  readonly income: number;
  readonly power: number;
  readonly clandestine: number;
  readonly level: number;
  readonly viability: number;
}

function computePopulationMedians(
  players: readonly (import('./types').PlayerState & {
    units: import('./types').UnitCounts;
  })[],
): PopulationMedians {
  if (players.length === 0) {
    return { income: 0, power: 0, clandestine: 0, level: 0, viability: 0 };
  }
  const incomes = players.map(calculateTurnIncome);
  const powers = players.map(getPlayerPower);
  const clandestine = players.map(clandestinePower);
  const levels = players.map((player) => player.level);
  const medians: PopulationMedians = {
    income: nearestRank(incomes, 0.5),
    power: nearestRank(powers, 0.5),
    clandestine: nearestRank(clandestine, 0.5),
    level: nearestRank(levels, 0.5),
    viability: 0,
  };
  const viabilityValues = players.map((player, index) =>
    compositeViability({
      income: incomes[index] ?? 0,
      combatPower: powers[index] ?? 0,
      clandestinePower: clandestine[index] ?? 0,
      level: player.level,
      populationMedians: medians,
    }),
  );
  return { ...medians, viability: nearestRank(viabilityValues, 0.5) };
}

interface CollectCohortMetricsInput {
  readonly players: readonly import('./types').PlayerState[];
  readonly playerMeta: import('./scenarioTypes').EraScenarioState['playerMeta'];
  readonly allianceMeta: import('./scenarioTypes').EraScenarioState['allianceMeta'];
  readonly events: readonly ScenarioEvent[];
  readonly day: number;
}

/**
 * Aggregate per-cohort metrics at a checkpoint day. The output is stable:
 * players are pre-sorted by id, cohorts are grouped by a NUL-delimited
 * `(cohortId, persona, activityClass)` key, and groups are emitted in
 * lexicographic key order. Quantiles use nearest-rank; cumulative counters
 * are summed from real ScenarioEvents with `day <= current day`.
 */
export function collectCohortMetrics(
  state: EraSimulationRunState,
  day = state.base.day,
): CohortMetricRecord[] {
  return collectCohortMetricsFromInput({
    players: Array.from(state.base.players.values()),
    playerMeta: state.scenario.playerMeta,
    allianceMeta: state.scenario.allianceMeta,
    events: state.scenario.events,
    day,
  });
}

export function collectCohortMetricsFromInput(
  input: CollectCohortMetricsInput,
): CohortMetricRecord[] {
  const players = [...input.players].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (players.length === 0) return [];
  const medians = computePopulationMedians(players);
  const playerEvents = buildPlayerEventAccumulators(input.events, input.day);
  const groups = new Map<
    string,
    {
      cohortId: string;
      persona: Persona;
      activityClass: string;
      players: typeof players;
    }
  >();
  for (const player of players) {
    const meta = input.playerMeta.get(player.id);
    if (!meta) continue;
    const key = `${meta.cohortId}\u0000${meta.persona}\u0000${meta.activityClass}`;
    const existing = groups.get(key);
    if (existing) {
      existing.players.push(player);
    } else {
      groups.set(key, {
        cohortId: meta.cohortId,
        persona: meta.persona,
        activityClass: meta.activityClass,
        players: [player],
      });
    }
  }
  const playerAllianceIds = new Map<string, Set<string>>();
  for (const [allianceId, manifest] of input.allianceMeta) {
    for (const seat of manifest.members) {
      const set = playerAllianceIds.get(seat.playerId) ?? new Set<string>();
      set.add(allianceId);
      playerAllianceIds.set(seat.playerId, set);
    }
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => {
      const { cohortId, persona, activityClass, players: members } = group;
      const incomes = members.map(calculateTurnIncome);
      const powers = members.map(getPlayerPower);
      const clandestine = members.map(clandestinePower);
      const viability = members.map((player, index) =>
        compositeViability({
          income: incomes[index] ?? 0,
          combatPower: powers[index] ?? 0,
          clandestinePower: clandestine[index] ?? 0,
          level: player.level,
          populationMedians: medians,
        }),
      );
      const memberAccumulators = members.map(
        (member) => playerEvents.get(member.id) ?? emptyAccumulator(),
      );
      const cumulativeEvents = sumAccumulators(memberAccumulators);
      const allianceIdSet = new Set<string>();
      for (const member of members) {
        const ids = playerAllianceIds.get(member.id);
        if (ids) for (const id of ids) allianceIdSet.add(id);
      }
      const allianceIds = Array.from(allianceIdSet).sort((a, b) =>
        a.localeCompare(b),
      );
      const joinedDays = members
        .map((member) => input.playerMeta.get(member.id)?.joinedOnDay ?? 0)
        .sort((a, b) => a - b);
      const joinedOnDayRange: readonly [number, number] | undefined =
        joinedDays.length > 0
          ? [joinedDays[0] ?? 0, joinedDays[joinedDays.length - 1] ?? 0]
          : undefined;
      const farmerVariants = new Set<FarmerVariant>();
      for (const member of members) {
        const meta = input.playerMeta.get(member.id);
        if (meta?.farmerVariant) farmerVariants.add(meta.farmerVariant);
      }
      const farmerVariant =
        farmerVariants.size === 1 ? Array.from(farmerVariants)[0] : undefined;
      return {
        day: input.day,
        cohortId,
        persona,
        activityClass,
        count: members.length,
        citizens: summarizeQuantiles(
          members.map((player) => player.units.citizen),
        ),
        workers: summarizeQuantiles(
          members.map((player) => player.units.worker),
        ),
        handGold: summarizeQuantiles(members.map((player) => player.gold)),
        bankGold: summarizeQuantiles(
          members.map((player) => player.goldInBank),
        ),
        strategicPower: summarizeQuantiles(powers),
        income: summarizeQuantiles(incomes),
        level: summarizeQuantiles(members.map((player) => player.level)),
        viability: summarizeQuantiles(viability),
        fortLevel: summarizeQuantiles(
          members.map((player) => player.fortLevel),
        ),
        fortHp: summarizeQuantiles(members.map((player) => player.fortHp)),
        xp: summarizeQuantiles(members.map((player) => player.xp)),
        attackTurns: summarizeQuantiles(
          members.map((player) => player.attackTurns),
        ),
        stamina: summarizeQuantiles(members.map((player) => player.stamina)),
        military: summarizeQuantiles(members.map(militaryHeadcount)),
        spies: summarizeQuantiles(members.map(spyHeadcount)),
        sentries: summarizeQuantiles(members.map(sentryHeadcount)),
        defensePressure: summarizeQuantiles(
          members.map((player) => player.defensePressureToday),
        ),
        spyPressure: summarizeQuantiles(
          members.map((player) => player.spyPressureToday),
        ),
        populationViabilityMedian: medians.viability,
        farmerVariant,
        allianceIds: allianceIds.length > 0 ? allianceIds : undefined,
        joinedOnDayRange,
        cumulativeEvents,
      };
    });
}

export { ZERO_EVENTS };
