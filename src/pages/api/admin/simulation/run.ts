import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { generatePopulation, simulateDay } from '@/sim';
import { getPlayerPower } from '@/sim/economy';
import {
  allocateBonusPoints,
  armedShare,
  spendOnArmy,
} from '@/sim/liveEconomy';
import {
  activeEvent,
  ACTIVITY_TYPES,
  applyLiveRulesToPlayer,
  assignActivityTypes,
  buyNextStructure,
  DEFAULT_ACTIVITY_MIX,
  formAlliances,
  makeFreshPlayer,
} from '@/sim/liveRules';
import {
  calculateProgressionPacing,
  projectDaysToLevel100,
} from '@/sim/progression';
import type {
  ActivityMix,
  ActivityType,
  BalanceParameters,
  DayResult,
  PlayerState,
  PopulationMetrics,
  SimGameEvent,
  SimulationConfig,
  SimulationState,
  TopPlayerSnapshot,
} from '@/sim/types';
import type { AuthenticatedRequest } from '@/types/api';
import {
  calculateProgressionXpPerTurn,
  getDefaultBattleConstants,
} from '@/utils/attackFunctions';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

interface SimulationRequest {
  populationSize: number;
  levelRange: [number, number];
  days: number;
  turnIntervalMinutes: number;
  newPlayerIntervalDays: number;
  newPlayersPerInterval: number;
  attackLevelRange: number;
  balance: Partial<BalanceParameters>;
  activityMix: ActivityMix;
  event?: SimGameEvent;
  dungeon: boolean;
  /** Percent of players in alliances, and how many members each has. */
  alliances: { share: number; size: number };
  seed?: number;
}

/** Outcomes for one kind of player, per player and per day present. */
interface ActivitySummary {
  activity: ActivityType;
  players: number;
  sessionsPerDay: number;
  attacksPerDay: number;
  attackWinRate: number;
  defenseWinRate: number;
  turnsSpentShare: number;
  lootGainedPerDay: number;
  lootLostPerDay: number;
  medianLevelsGained: number;
  medianXpPerDay: number;
  fastestXpPerDay: number;
  medianDaysToLevel100: number | null;
  fastestDaysToLevel100: number | null;
  avgMorale: number;
  armedShare: number;
  desertedPerDay: number;
}

interface ChartPoint {
  day: number;
  attacker: number;
  defender: number;
}

interface EconomyPoint {
  day: number;
  totalGold: number;
  lootPerDay: number;
  turnIncome: number;
}

interface PopulationPoint {
  day: number;
  players: number;
  breached: number;
  avgHeldTurns: number;
}

interface AttackPoint {
  day: number;
  total: number;
  lowTurn: number;
  highTurn: number;
  turnsGenerated: number;
  turnsSpent: number;
}

interface SimulationSummary {
  totalDays: number;
  totalAttacks: number;
  avgAttackerWinRate: number;
  avgDefenderWinRate: number;
  avgAttacksPerDay: number;
  avgLootPerDay: number;
  totalLoot: number;
  totalAttackerCasualties: number;
  totalDefenderCasualties: number;
  totalPlayers: number;
  finalBreachedPlayers: number;
  totalFortBreaches: number;
  maxLevel: number;
  avgLevel: number;
  avgAttackTurnsHeld: number;
  totalXpAwarded: number;
  avgXpPerDay: number;
  avgXpPerSpentTurn: number;
  pacingPlayerId: string | null;
  pacingPlayerName: string | null;
  projectedDaysToLevel100: number | null;
  projectedMonthsToLevel100: number | null;
  mercenariesHired: number;
  captivesTaken: number;
}

interface SimulationTiming {
  elapsedMs: number;
  elapsedSeconds: number;
  avgMsPerDay: number;
  startedAt: string;
  finishedAt: string;
  slowestDays: Array<{ day: number; elapsedMs: number; attacks: number }>;
}

interface PlayerProgressSnapshot {
  day: number;
  level: number;
  xp: number;
  gold: number;
  goldInBank: number;
  power: number;
  fortHp: number;
  fortMaxHp: number;
  attackTurns: number;
  units: PlayerState['units'];
  upgrades: PlayerState['upgrades'];
  spyLevel: number;
  sentryLevel: number;
  economyLevel: number;
}

interface PlayerProgressReport extends TopPlayerSnapshot {
  started: PlayerProgressSnapshot;
  final: PlayerProgressSnapshot;
  checkpoints: PlayerProgressSnapshot[];
  deltas: {
    level: number;
    xp: number;
    liquidGold: number;
    bankGold: number;
    totalGold: number;
    power: number;
    offenseUnits: number;
    defenseUnits: number;
    spyUnits: number;
    sentryUnits: number;
    workers: number;
  };
}

interface SimulationResponse {
  config: SimulationRequest & { effectiveBalance: BalanceParameters };
  summary: SimulationSummary;
  byActivity: ActivitySummary[];
  dailyResults: DayResult[];
  charts: {
    winRates: ChartPoint[];
    economy: EconomyPoint[];
    population: PopulationPoint[];
    attacks: AttackPoint[];
  };
  topPlayers: TopPlayerSnapshot[];
  playerProgress: PlayerProgressReport[];
  timing: SimulationTiming;
}

const LIVE_BATTLE_CONSTANTS = getDefaultBattleConstants();
const DEFAULT_BALANCE: BalanceParameters = {
  attackerDamageMultiplier: LIVE_BATTLE_CONSTANTS.ATTACKER_DAMAGE_MULTIPLIER,
  defenderCounterDamageMultiplier:
    LIVE_BATTLE_CONSTANTS.DEFENDER_COUNTER_DAMAGE_MULTIPLIER,
  maxPillageSharePerAttack: LIVE_BATTLE_CONSTANTS.MAX_PILLAGE_SHARE_PER_ATTACK,
  damageVarianceMin: LIVE_BATTLE_CONSTANTS.DAMAGE_VARIANCE_MIN,
  damageVarianceMax: LIVE_BATTLE_CONSTANTS.DAMAGE_VARIANCE_MAX,
};

function createSeededRandom(seed: number): () => number {
  let value = Math.abs(Math.floor(seed)) || 1;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createPopulationMetrics(): PopulationMetrics {
  return {
    dailyResults: [],
    attackerWinRateOverTime: [],
    defenderWinRateOverTime: [],
    intelSuccessRateOverTime: [],
    intelToAttackConversionRate: [],
    totalGoldInEconomy: [],
    wealthGiniCoefficient: [],
    levelDistributionOverTime: [],
    avgUnitsPerPlayer: [],
    powerCreepIndex: [],
    avgTurnsPerAttack: [],
    attacksPerActivePlayer: [],
    lowTurnVsHighTurnRatio: [],
    activePlayersPerDay: [],
    defeatedPlayersPerDay: [],
    breachedPlayersPerDay: [],
    attackTurnsHeldPerDay: [],
  };
}

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    units: { ...player.units },
    items: { ...player.items },
    upgrades: { ...player.upgrades },
    bonuses: { ...player.bonuses },
    dailyLimits: { ...player.dailyLimits },
    behavior: { ...player.behavior },
    intelCache: new Map(player.intelCache),
    attackHistory: new Map(
      Array.from(player.attackHistory.entries()).map(([key, value]) => [
        key,
        [...value],
      ]),
    ),
    incomingAttackHistory: new Map(
      Array.from(player.incomingAttackHistory.entries()).map(([key, value]) => [
        key,
        [...value],
      ]),
    ),
    targetMemory: new Map(
      Array.from(player.targetMemory.entries()).map(([key, value]) => [
        key,
        { ...value },
      ]),
    ),
    bankDepositHistory: [...player.bankDepositHistory],
  };
}

function snapshotPlayerProgress(
  player: PlayerState,
  day: number,
): PlayerProgressSnapshot {
  return {
    day,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    goldInBank: player.goldInBank,
    power: getPlayerPower(player),
    fortHp: player.fortHp,
    fortMaxHp: player.fortMaxHp,
    attackTurns: player.attackTurns,
    units: { ...player.units },
    upgrades: { ...player.upgrades },
    spyLevel: player.spyLevel,
    sentryLevel: player.sentryLevel,
    economyLevel: player.economyLevel,
  };
}

function validateActivityMix(raw: any): ActivityMix {
  const mix = Object.fromEntries(
    ACTIVITY_TYPES.map((type) => {
      const value = Number(raw?.[type]);
      return [type, Number.isFinite(value) ? clamp(value, 0, 100) : 0];
    }),
  ) as ActivityMix;
  const total = ACTIVITY_TYPES.reduce((sum, type) => sum + mix[type], 0);
  return total > 0 ? mix : { ...DEFAULT_ACTIVITY_MIX };
}

/** Clamps an optional game event to the ranges the live admin events page allows. */
function validateEvent(raw: any, days: number): SimGameEvent | undefined {
  if (!raw || raw.enabled !== true) return undefined;
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
  };
  return {
    startDay: Math.floor(num(raw.startDay, 1, 1, days)),
    days: Math.floor(num(raw.days, 2, 1, 365)),
    xpMultiplier: num(raw.xpMultiplier, 1, 0.1, 10),
    goldMultiplier: num(raw.goldMultiplier, 1, 0.1, 10),
    extraTurnsPerTick: Math.floor(num(raw.extraTurnsPerTick, 0, 0, 10)),
    citizenMultiplier: num(raw.citizenMultiplier, 1, 0.1, 10),
    unitCostDiscountPercent: num(raw.unitCostDiscountPercent, 0, 0, 25),
    armoryCostDiscountPercent: num(raw.armoryCostDiscountPercent, 0, 0, 25),
  };
}

/** Days of recent XP the L100 projection averages. */
const RECENT_XP_DAYS = 7;

/** Picks an activity type for one late joiner, weighted by the mix. */
function pickActivity(mix: ActivityMix, random: () => number): ActivityType {
  const total = ACTIVITY_TYPES.reduce((sum, type) => sum + mix[type], 0);
  let roll = random() * total;
  for (const type of ACTIVITY_TYPES) {
    roll -= mix[type];
    if (roll < 0) return type;
  }
  return ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
}

/**
 * Spends a player's starting gold the way it would have been spent before the
 * run: bonus points, structures, then the army. Starting players otherwise
 * spend their first day catching up.
 */
function settleLivePlayer(
  player: PlayerState,
  ticksPerDay: number,
  day: number,
): void {
  allocateBonusPoints(player);
  for (let purchases = 0; purchases < 20; purchases++) {
    if (buyNextStructure(player) <= 0) break;
  }
  spendOnArmy(player, ticksPerDay, undefined, day);
}

function sumStat(
  players: Map<string, PlayerState>,
  key: 'mercenariesHired' | 'captivesTaken',
): number {
  let total = 0;
  for (const player of players.values()) total += player.simStats?.[key] ?? 0;
  return total;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function buildActivitySummaries(
  players: Map<string, PlayerState>,
  totalDays: number,
  currentXpRate: (playerId: string) => number | undefined,
): ActivitySummary[] {
  return ACTIVITY_TYPES.map((activity) => {
    const group = Array.from(players.values()).filter(
      (player) => player.activity === activity && player.simStats,
    );
    let playerDays = 0;
    let sessions = 0;
    let attacks = 0;
    let attackWins = 0;
    let defenses = 0;
    let defenseWins = 0;
    let turnsSpent = 0;
    let turnsAvailable = 0;
    let lootGained = 0;
    let lootLost = 0;
    let morale = 0;
    let armed = 0;
    let deserted = 0;
    const levelsGained: number[] = [];
    const xpPerDay: number[] = [];
    const daysToLevel100: number[] = [];
    for (const player of group) {
      const stats = player.simStats!;
      const days = Math.max(
        1,
        totalDays - Math.max(0, player.joinedOnDay ?? 0),
      );
      playerDays += days;
      sessions += stats.sessions;
      attacks += stats.attacks;
      attackWins += stats.attackWins;
      defenses += stats.defenses;
      defenseWins += stats.defenseWins;
      turnsSpent += stats.turnsSpent;
      // Turns held at the start plus one per tick, logged in or not.
      turnsAvailable += stats.startTurns + stats.turnsGenerated;
      lootGained += stats.lootGained;
      lootLost += stats.lootLost;
      morale += player.kingdomMorale ?? 0;
      armed += armedShare(player);
      deserted += stats.deserted;
      levelsGained.push(player.level - stats.startLevel);
      const rate = (player.xp - stats.startXp) / days;
      xpPerDay.push(rate);
      const projected = projectDaysToLevel100(
        player.xp,
        currentXpRate(player.id) ?? rate,
      );
      if (projected !== null) daysToLevel100.push(projected);
    }
    const perDay = (value: number) => (playerDays > 0 ? value / playerDays : 0);
    const fastestXp = xpPerDay.length > 0 ? Math.max(...xpPerDay) : 0;
    return {
      activity,
      players: group.length,
      sessionsPerDay: perDay(sessions),
      attacksPerDay: perDay(attacks),
      attackWinRate: attacks > 0 ? attackWins / attacks : 0,
      defenseWinRate: defenses > 0 ? defenseWins / defenses : 0,
      turnsSpentShare: turnsAvailable > 0 ? turnsSpent / turnsAvailable : 0,
      lootGainedPerDay: perDay(lootGained),
      lootLostPerDay: perDay(lootLost),
      medianLevelsGained: median(levelsGained),
      medianXpPerDay: median(xpPerDay),
      fastestXpPerDay: fastestXp,
      // Players who gained no XP never get there; they count as never.
      medianDaysToLevel100:
        daysToLevel100.length > group.length / 2
          ? median([
              ...daysToLevel100,
              ...Array(group.length - daysToLevel100.length).fill(Infinity),
            ])
          : null,
      fastestDaysToLevel100:
        daysToLevel100.length > 0 ? Math.min(...daysToLevel100) : null,
      avgMorale: group.length > 0 ? morale / group.length : 0,
      armedShare: group.length > 0 ? armed / group.length : 0,
      desertedPerDay: perDay(deserted),
    };
  });
}

export function validateConfig(body: any): SimulationRequest {
  const days = clamp(Number(body.days) || 30, 1, 365);
  const minLevel = clamp(Number(body.levelRange?.[0]) || 5, 1, 100);
  const maxLevel = clamp(Number(body.levelRange?.[1]) || 20, 1, 100);

  return {
    populationSize: clamp(Number(body.populationSize) || 100, 2, 500),
    levelRange: [Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel)],
    days,
    turnIntervalMinutes: clamp(Number(body.turnIntervalMinutes) || 30, 5, 240),
    newPlayerIntervalDays: clamp(
      Number(body.newPlayerIntervalDays) || 0,
      0,
      120,
    ),
    newPlayersPerInterval: clamp(
      Number(body.newPlayersPerInterval) || 0,
      0,
      50,
    ),
    attackLevelRange: clamp(
      Number.isFinite(Number(body.attackLevelRange))
        ? Number(body.attackLevelRange)
        : Number(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE ?? 5),
      0,
      100,
    ),
    activityMix: validateActivityMix(body.activityMix),
    event: validateEvent(body.event, days),
    dungeon: body.dungeon === true,
    alliances: {
      share: clamp(Number(body.alliances?.share) || 0, 0, 100),
      size: clamp(Math.floor(Number(body.alliances?.size) || 5), 2, 50),
    },
    balance: {
      attackerDamageMultiplier: body.balance?.attackerDamageMultiplier,
      defenderCounterDamageMultiplier:
        body.balance?.defenderCounterDamageMultiplier,
      maxPillageSharePerAttack: body.balance?.maxPillageSharePerAttack,
      damageVarianceMin: body.balance?.damageVarianceMin,
      damageVarianceMax: body.balance?.damageVarianceMax,
    },
    // Without a seed every turn tick would replay the same default stream,
    // so pick one and report it back; the run can then be repeated.
    seed: Number.isFinite(Number(body.seed))
      ? Number(body.seed)
      : Math.floor(Math.random() * 2147483646) + 1,
  };
}

function buildSummary(
  dailyResults: DayResult[],
  players: Map<string, PlayerState>,
  state: SimulationState,
  playerProgress: PlayerProgressReport[],
  currentXpRate: (playerId: string) => number | undefined,
): SimulationSummary {
  const totalAttacks = dailyResults.reduce(
    (sum, day) => sum + day.totalAttacks,
    0,
  );
  const totalLoot = dailyResults.reduce(
    (sum, day) => sum + day.totalLootTransferred,
    0,
  );
  const totalAttackerCasualties = dailyResults.reduce(
    (sum, day) => sum + day.totalAttackerCasualties,
    0,
  );
  const totalDefenderCasualties = dailyResults.reduce(
    (sum, day) => sum + day.totalDefenderCasualties,
    0,
  );
  const totalFortBreaches = dailyResults.reduce(
    (sum, day) => sum + day.fortBreaches,
    0,
  );
  const totalXpAwarded = dailyResults.reduce(
    (sum, day) => sum + day.totalXpAwarded,
    0,
  );
  const totalTurnsSpent = dailyResults.reduce(
    (sum, day) => sum + day.attackTurnsSpent,
    0,
  );
  // Weighted by attacks, so quiet days do not drag the rate down.
  const avgAttackerWinRate =
    totalAttacks > 0
      ? dailyResults.reduce(
          (sum, day) => sum + day.attackerWinRate * day.totalAttacks,
          0,
        ) / totalAttacks
      : 0;
  const avgDefenderWinRate =
    totalAttacks > 0
      ? dailyResults.reduce(
          (sum, day) => sum + day.defenderWinRate * day.totalAttacks,
          0,
        ) / totalAttacks
      : 0;
  const avgAttacksPerDay =
    dailyResults.length > 0 ? totalAttacks / dailyResults.length : 0;
  const avgLootPerDay =
    dailyResults.length > 0 ? totalLoot / dailyResults.length : 0;
  const avgAttackTurnsHeld =
    state.metrics.attackTurnsHeldPerDay.reduce((sum, value) => sum + value, 0) /
    Math.max(state.metrics.attackTurnsHeldPerDay.length, 1);
  const avgXpPerSpentTurn = totalXpAwarded / Math.max(1, totalTurnsSpent);
  const progressionPacing = calculateProgressionPacing(
    playerProgress,
    currentXpRate,
  );

  let maxLevel = 0;
  let totalLevel = 0;
  for (const player of players.values()) {
    maxLevel = Math.max(maxLevel, player.level);
    totalLevel += player.level;
  }

  return {
    totalDays: dailyResults.length,
    totalAttacks,
    avgAttackerWinRate,
    avgDefenderWinRate,
    avgAttacksPerDay,
    avgLootPerDay,
    totalLoot,
    totalAttackerCasualties,
    totalDefenderCasualties,
    totalPlayers: players.size,
    finalBreachedPlayers:
      state.metrics.breachedPlayersPerDay[
        state.metrics.breachedPlayersPerDay.length - 1
      ] ?? 0,
    totalFortBreaches,
    maxLevel,
    avgLevel: players.size > 0 ? Math.round(totalLevel / players.size) : 0,
    avgAttackTurnsHeld,
    totalXpAwarded,
    avgXpPerDay: progressionPacing.avgXpPerDay,
    avgXpPerSpentTurn,
    pacingPlayerId: progressionPacing.pacingPlayerId,
    pacingPlayerName: progressionPacing.pacingPlayerName,
    projectedDaysToLevel100: progressionPacing.projectedDaysToLevel100,
    projectedMonthsToLevel100: progressionPacing.projectedMonthsToLevel100,
    mercenariesHired: sumStat(players, 'mercenariesHired'),
    captivesTaken: sumStat(players, 'captivesTaken'),
  };
}

function buildCharts(
  dailyResults: DayResult[],
  state: SimulationState,
): SimulationResponse['charts'] {
  return {
    winRates: dailyResults.map((day) => ({
      day: day.day,
      attacker: Number((day.attackerWinRate * 100).toFixed(1)),
      defender: Number((day.defenderWinRate * 100).toFixed(1)),
    })),
    economy: dailyResults.map((day, index) => ({
      day: day.day,
      totalGold: state.metrics.totalGoldInEconomy[index] ?? 0,
      lootPerDay: day.totalLootTransferred,
      turnIncome: day.totalTurnIncome,
    })),
    population: dailyResults.map((day, index) => ({
      day: day.day,
      players: state.metrics.activePlayersPerDay[index] ?? 0,
      breached: state.metrics.breachedPlayersPerDay[index] ?? 0,
      avgHeldTurns: Number(
        (state.metrics.attackTurnsHeldPerDay[index] ?? 0).toFixed(1),
      ),
    })),
    attacks: dailyResults.map((day) => ({
      day: day.day,
      total: day.totalAttacks,
      lowTurn: day.lowTurnAttacks,
      highTurn: day.highTurnAttacks,
      turnsGenerated: day.attackTurnsGenerated,
      turnsSpent: day.attackTurnsSpent,
    })),
  };
}

function snapshotTopPlayers(
  players: Map<string, PlayerState>,
  limit = 10,
): TopPlayerSnapshot[] {
  return Array.from(players.values())
    .map((player) => ({
      id: player.id,
      displayName: player.displayName,
      level: player.level,
      gold: player.gold,
      goldInBank: player.goldInBank,
      status: player.status,
      power: getPlayerPower(player),
      activity: player.activity,
    }))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.power - a.power;
    })
    .slice(0, limit);
}

function getCheckpointDays(totalDays: number): number[] {
  return Array.from(
    new Set(
      [0, 1, 7, 14, 30, 60, 90, 120, 180, 270, 365, totalDays].filter(
        (day) => day >= 0 && day <= totalDays,
      ),
    ),
  ).sort((a, b) => a - b);
}

function buildPlayerProgress(
  topPlayers: TopPlayerSnapshot[],
  progressByPlayer: Map<string, PlayerProgressSnapshot[]>,
): PlayerProgressReport[] {
  return topPlayers.map((player) => {
    const checkpoints = progressByPlayer.get(player.id) ?? [];
    const started = checkpoints[0];
    const final = checkpoints[checkpoints.length - 1] ?? started;

    return {
      ...player,
      started,
      final,
      checkpoints,
      deltas: {
        level: final.level - started.level,
        xp: final.xp - started.xp,
        liquidGold: final.gold - started.gold,
        bankGold: final.goldInBank - started.goldInBank,
        totalGold:
          final.gold + final.goldInBank - (started.gold + started.goldInBank),
        power: final.power - started.power,
        offenseUnits:
          final.units.soldier +
          final.units.knight +
          final.units.berserker -
          (started.units.soldier +
            started.units.knight +
            started.units.berserker),
        defenseUnits:
          final.units.guard +
          final.units.archer +
          final.units.royalGuard -
          (started.units.guard +
            started.units.archer +
            started.units.royalGuard),
        spyUnits:
          final.units.spy +
          final.units.infiltrator +
          final.units.assassin -
          (started.units.spy +
            started.units.infiltrator +
            started.units.assassin),
        sentryUnits:
          final.units.sentry +
          final.units.sentinel +
          final.units.inquisitor -
          (started.units.sentry +
            started.units.sentinel +
            started.units.inquisitor),
        workers: final.units.worker - started.units.worker,
      },
    };
  });
}

export async function runSimulation(
  config: SimulationRequest,
): Promise<SimulationResponse> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const effectiveBalance: BalanceParameters = {
    ...DEFAULT_BALANCE,
    ...Object.fromEntries(
      Object.entries(config.balance).filter(([, value]) => value != null),
    ),
  };

  const simConfig: SimulationConfig = {
    seed: config.seed,
    logLevel: 'none',
    balance: effectiveBalance,
    turnIntervalMinutes: config.turnIntervalMinutes,
    attackLevelRange: config.attackLevelRange,
    random: config.seed != null ? createSeededRandom(config.seed) : undefined,
    live: true,
    event: config.event,
    dungeon: config.dungeon,
  };
  // A separate stream for population set-up keeps battle rolls independent of it.
  const setupRandom = createSeededRandom((config.seed ?? 1) + 7919);
  const ticksPerDay = Math.max(
    1,
    Math.floor((24 * 60) / config.turnIntervalMinutes),
  );

  const initialPopulation = generatePopulation(
    config.populationSize,
    config.levelRange,
    config.seed,
  );
  const players = new Map<string, PlayerState>();
  const activities = assignActivityTypes(
    initialPopulation.length,
    config.activityMix,
    setupRandom,
  );
  initialPopulation.forEach((player, index) => {
    const clone = clonePlayer(player);
    applyLiveRulesToPlayer(clone, activities[index], setupRandom);
    settleLivePlayer(clone, ticksPerDay, 0);
    players.set(clone.id, clone);
  });
  formAlliances(
    Array.from(players.values()),
    config.alliances.share,
    config.alliances.size,
    setupRandom,
  );

  const state: SimulationState = {
    players,
    day: 0,
    totalDays: config.days,
    history: [],
    metrics: createPopulationMetrics(),
    config: simConfig,
  };

  let nextPlayerId = config.populationSize;
  const checkpointDays = getCheckpointDays(config.days);
  // Each player's XP gain on its most recent days, without event bonuses and
  // at the XP-per-turn rate of the level it reached, for the L100 projection.
  const recentXp = new Map<string, Array<{ gain: number; level: number }>>();
  const recordXpDay = (
    before: Map<string, { xp: number; level: number }>,
    day: number,
  ) => {
    const multiplier = activeEvent(config.event, day)?.xpMultiplier ?? 1;
    for (const player of state.players.values()) {
      const start = before.get(player.id);
      if (!start) continue;
      const days = recentXp.get(player.id) ?? [];
      days.push({
        gain: (player.xp - start.xp) / multiplier,
        level: start.level,
      });
      if (days.length > RECENT_XP_DAYS) days.shift();
      recentXp.set(player.id, days);
    }
  };
  const currentXpRate = (playerId: string): number | undefined => {
    const player = state.players.get(playerId);
    const days = recentXp.get(playerId);
    if (!player || !days?.length) return undefined;
    const finalRate = calculateProgressionXpPerTurn(player.level);
    return (
      days.reduce(
        (sum, entry) =>
          sum +
          (entry.gain * finalRate) / calculateProgressionXpPerTurn(entry.level),
        0,
      ) / days.length
    );
  };
  const progressByPlayer = new Map<string, PlayerProgressSnapshot[]>();
  const dayTimings: SimulationTiming['slowestDays'] = [];

  const recordProgress = (day: number) => {
    if (!checkpointDays.includes(day)) return;
    for (const player of state.players.values()) {
      const snapshots = progressByPlayer.get(player.id) ?? [];
      snapshots.push(snapshotPlayerProgress(player, day));
      progressByPlayer.set(player.id, snapshots);
    }
  };

  recordProgress(0);

  for (let day = 0; day < config.days; day++) {
    if (
      config.newPlayerIntervalDays > 0 &&
      config.newPlayersPerInterval > 0 &&
      day > 0 &&
      day % config.newPlayerIntervalDays === 0
    ) {
      const joiners = generatePopulation(
        config.newPlayersPerInterval,
        config.levelRange,
        config.seed != null ? config.seed + day : undefined,
      );
      for (const joiner of joiners) {
        const clone = clonePlayer(joiner);
        clone.id = `player_${nextPlayerId}`;
        clone.displayName = `Player ${nextPlayerId}`;
        // Late joiners are brand-new accounts, not copies of veterans.
        makeFreshPlayer(
          clone,
          pickActivity(config.activityMix, setupRandom),
          setupRandom,
          day,
        );
        settleLivePlayer(clone, ticksPerDay, day);
        nextPlayerId += 1;
        state.players.set(clone.id, clone);
        progressByPlayer.set(clone.id, [snapshotPlayerProgress(clone, day)]);
      }
    }

    const xpBefore = new Map(
      Array.from(state.players.values(), (player) => [
        player.id,
        { xp: player.xp, level: player.level },
      ]),
    );
    const dayStartedAt = Date.now();
    const dayResult = await simulateDay(state);
    recordXpDay(xpBefore, dayResult.day);
    dayTimings.push({
      day: dayResult.day,
      elapsedMs: Date.now() - dayStartedAt,
      attacks: dayResult.totalAttacks,
    });
    state.metrics.dailyResults.push(dayResult);
    state.metrics.attackerWinRateOverTime.push(dayResult.attackerWinRate);
    state.metrics.defenderWinRateOverTime.push(dayResult.defenderWinRate);
    state.metrics.intelSuccessRateOverTime.push(dayResult.intelSuccessRate);
    state.metrics.avgTurnsPerAttack.push(dayResult.avgTurnsPerAttack);
    state.metrics.lowTurnVsHighTurnRatio.push(
      dayResult.highTurnAttacks > 0
        ? dayResult.lowTurnAttacks / dayResult.highTurnAttacks
        : 0,
    );

    let totalGold = 0;
    let totalHeldTurns = 0;
    let breached = 0;
    const levelDistribution = new Map<number, number>();
    for (const player of state.players.values()) {
      totalGold += player.gold + player.goldInBank;
      totalHeldTurns += player.attackTurns;
      if (player.fortHp <= 0) breached += 1;
      levelDistribution.set(
        player.level,
        (levelDistribution.get(player.level) ?? 0) + 1,
      );
    }

    state.metrics.totalGoldInEconomy.push(totalGold);
    state.metrics.activePlayersPerDay.push(state.players.size);
    state.metrics.defeatedPlayersPerDay.push(0);
    state.metrics.breachedPlayersPerDay.push(breached);
    state.metrics.attackTurnsHeldPerDay.push(
      state.players.size > 0 ? totalHeldTurns / state.players.size : 0,
    );
    state.metrics.levelDistributionOverTime.push(levelDistribution);
    recordProgress(dayResult.day);
  }

  const dailyResults = state.history;
  recordProgress(config.days);
  const topPlayers = snapshotTopPlayers(state.players);
  const finishedAtMs = Date.now();
  const elapsedMs = finishedAtMs - startedAtMs;

  const playerProgress = buildPlayerProgress(topPlayers, progressByPlayer);

  return {
    config: { ...config, effectiveBalance },
    summary: buildSummary(
      dailyResults,
      state.players,
      state,
      playerProgress,
      currentXpRate,
    ),
    byActivity: buildActivitySummaries(
      state.players,
      config.days,
      currentXpRate,
    ),
    dailyResults,
    charts: buildCharts(dailyResults, state),
    topPlayers,
    playerProgress,
    timing: {
      elapsedMs,
      elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
      avgMsPerDay:
        dailyResults.length > 0
          ? Number((elapsedMs / dailyResults.length).toFixed(1))
          : 0,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      slowestDays: [...dayTimings]
        .sort((a, b) => b.elapsedMs - a.elapsedMs)
        .slice(0, 10),
    },
  };
}

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const config = validateConfig(req.body);
    // Recorded before the run so a long or failing simulation is still on file.
    await logActionStrict({
      userId: Number(req.session?.user?.id),
      action: 'ADMIN_SIMULATION_RUN',
      ip: getRequestIp(req),
      details: { config },
    });
    const result = await runSimulation(config);
    return res.status(200).json(result);
  } catch (error) {
    logError('Simulation run failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Simulation failed',
    });
  }
}

export default guardedHandler(handler);
