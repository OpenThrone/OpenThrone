import type { NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';
import { generatePopulation, simulateDay } from '@/sim';
import { getPlayerPower } from '@/sim/economy';
import { calculateProgressionPacing } from '@/sim/progression';
import type {
  BalanceParameters,
  DayResult,
  PlayerState,
  PopulationMetrics,
  SimulationConfig,
  SimulationState,
  TopPlayerSnapshot,
} from '@/sim/types';
import type { AuthenticatedRequest } from '@/types/api';
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
  seed?: number;
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

const DEFAULT_BALANCE: BalanceParameters = {
  attackerDamageMultiplier: 1.238,
  defenderCounterDamageMultiplier: 0.83,
  maxPillageSharePerAttack: 0.22,
  damageVarianceMin: 0.92,
  damageVarianceMax: 1.08,
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

function validateConfig(body: any): SimulationRequest {
  const minLevel = clamp(Number(body.levelRange?.[0]) || 5, 1, 100);
  const maxLevel = clamp(Number(body.levelRange?.[1]) || 20, 1, 100);

  return {
    populationSize: clamp(Number(body.populationSize) || 100, 2, 500),
    levelRange: [Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel)],
    days: clamp(Number(body.days) || 30, 1, 365),
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
      Number(body.attackLevelRange) ||
        Number(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE ?? 5),
      0,
      100,
    ),
    balance: {
      attackerDamageMultiplier: body.balance?.attackerDamageMultiplier,
      defenderCounterDamageMultiplier:
        body.balance?.defenderCounterDamageMultiplier,
      maxPillageSharePerAttack: body.balance?.maxPillageSharePerAttack,
      damageVarianceMin: body.balance?.damageVarianceMin,
      damageVarianceMax: body.balance?.damageVarianceMax,
    },
    seed: body.seed != null ? Number(body.seed) : undefined,
  };
}

function buildSummary(
  dailyResults: DayResult[],
  players: Map<string, PlayerState>,
  state: SimulationState,
  playerProgress: PlayerProgressReport[],
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
  const avgAttackerWinRate =
    dailyResults.length > 0
      ? dailyResults.reduce((sum, day) => sum + day.attackerWinRate, 0) /
        dailyResults.length
      : 0;
  const avgDefenderWinRate =
    dailyResults.length > 0
      ? dailyResults.reduce((sum, day) => sum + day.defenderWinRate, 0) /
        dailyResults.length
      : 0;
  const avgAttacksPerDay =
    dailyResults.length > 0 ? totalAttacks / dailyResults.length : 0;
  const avgLootPerDay =
    dailyResults.length > 0 ? totalLoot / dailyResults.length : 0;
  const avgAttackTurnsHeld =
    state.metrics.attackTurnsHeldPerDay.reduce((sum, value) => sum + value, 0) /
    Math.max(state.metrics.attackTurnsHeldPerDay.length, 1);
  const avgXpPerSpentTurn = totalXpAwarded / Math.max(1, totalTurnsSpent);
  const progressionPacing = calculateProgressionPacing(playerProgress);

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

async function runSimulation(
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
  };

  const initialPopulation = generatePopulation(
    config.populationSize,
    config.levelRange,
    config.seed,
  );
  const players = new Map<string, PlayerState>();
  for (const player of initialPopulation) {
    const clone = clonePlayer(player);
    players.set(clone.id, clone);
  }

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
        nextPlayerId += 1;
        state.players.set(clone.id, clone);
        progressByPlayer.set(clone.id, [snapshotPlayerProgress(clone, day)]);
      }
    }

    const dayStartedAt = Date.now();
    const dayResult = await simulateDay(state);
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
    summary: buildSummary(dailyResults, state.players, state, playerProgress),
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
