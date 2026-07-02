import { applyDecision, makeDailyDecisions } from './behaviors';
import {
  calculateMaximumBankDeposits,
  calculateRecruitBonus,
  calculateTurnIncome,
  gainXp,
} from './economy';
import {
  createBattleConfigFromBalance,
  runSingleBattle,
  simulateSpyIntel,
} from './engine';
import { createSimPlayer } from './presets';
import {
  DayResult,
  PlayerState,
  PopulationMetrics,
  SimulationConfig,
  SimulationState,
} from './types';

const DEFAULT_TURN_INTERVAL_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_ATTACK_LEVEL_RANGE = Number(
  process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE ?? 5,
);
const MAX_SIM_ATTACK_TURNS = 10;

function createSeededRandom(seed: number): () => number {
  let value = Math.abs(Math.floor(seed)) || 1;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function sanitizeNumber(value: number, fallback = 0): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return fallback;
  return value;
}

function sanitizePlayerState(player: PlayerState): void {
  player.level = Math.max(1, Math.floor(sanitizeNumber(player.level, 1)));
  player.xp = Math.max(0, sanitizeNumber(player.xp, 0));
  player.gold = Math.max(0, sanitizeNumber(player.gold, 0));
  player.goldInBank = Math.max(0, sanitizeNumber(player.goldInBank, 0));
  player.attackTurns = Math.max(
    0,
    Math.floor(sanitizeNumber(player.attackTurns, 0)),
  );
  player.stamina = Math.max(0, Math.floor(sanitizeNumber(player.stamina, 0)));
  player.maxStamina = Math.max(
    1,
    Math.floor(sanitizeNumber(player.maxStamina, 100)),
  );
  player.defensePressureToday = Math.max(
    0,
    Math.floor(sanitizeNumber(player.defensePressureToday, 0)),
  );
  player.spyPressureToday = Math.max(
    0,
    Math.floor(sanitizeNumber(player.spyPressureToday, 0)),
  );
  player.fortHp = Math.max(0, sanitizeNumber(player.fortHp, 0));
  player.fortMaxHp = Math.max(1, sanitizeNumber(player.fortMaxHp, 1));
  player.fortLevel = Math.max(
    1,
    Math.floor(sanitizeNumber(player.fortLevel, 1)),
  );
  player.houseLevel = Math.max(
    1,
    Math.floor(sanitizeNumber(player.houseLevel, 1)),
  );
  player.spyLevel = Math.max(1, Math.floor(sanitizeNumber(player.spyLevel, 1)));
  player.sentryLevel = Math.max(
    1,
    Math.floor(sanitizeNumber(player.sentryLevel, 1)),
  );
  player.economyLevel = Math.max(
    1,
    Math.floor(sanitizeNumber(player.economyLevel, 1)),
  );
  player.recruitBonus = Math.max(
    1,
    Math.floor(sanitizeNumber(player.recruitBonus, 1)),
  );
  player.maximumBankDeposits = Math.max(
    1,
    Math.floor(sanitizeNumber(player.maximumBankDeposits, 3)),
  );

  for (const key of Object.keys(player.units) as Array<
    keyof PlayerState['units']
  >) {
    player.units[key] = Math.max(
      0,
      Math.floor(sanitizeNumber(player.units[key], 0)),
    );
  }

  player.upgrades.offense = Math.max(
    0,
    Math.floor(sanitizeNumber(player.upgrades.offense, 0)),
  );
  player.upgrades.defense = Math.max(
    0,
    Math.floor(sanitizeNumber(player.upgrades.defense, 0)),
  );
  player.bonuses.attack = sanitizeNumber(player.bonuses.attack, 0);
  player.bonuses.defense = sanitizeNumber(player.bonuses.defense, 0);
  player.bonuses.spy = sanitizeNumber(player.bonuses.spy, 0);
  player.bonuses.sentry = sanitizeNumber(player.bonuses.sentry, 0);
}

function getTurnIntervalMinutes(config: SimulationConfig): number {
  const interval = Number(
    config.turnIntervalMinutes ?? DEFAULT_TURN_INTERVAL_MINUTES,
  );
  return Number.isFinite(interval) && interval > 0
    ? interval
    : DEFAULT_TURN_INTERVAL_MINUTES;
}

function getTicksPerDay(config: SimulationConfig): number {
  return Math.max(
    1,
    Math.floor(MINUTES_PER_DAY / getTurnIntervalMinutes(config)),
  );
}

function getWindowTicks(config: SimulationConfig): number {
  return getTicksPerDay(config);
}

function getAttackLevelRange(config: SimulationConfig): number {
  const range = Number(config.attackLevelRange ?? DEFAULT_ATTACK_LEVEL_RANGE);
  return Number.isFinite(range) && range >= 0
    ? Math.floor(range)
    : DEFAULT_ATTACK_LEVEL_RANGE;
}

function trimTickHistory(
  history: number[],
  currentTick: number,
  windowTicks: number,
): number[] {
  const minTick = currentTick - windowTicks + 1;
  return history.filter((tick) => tick >= minTick);
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

function convertPlayerToSim(player: PlayerState) {
  return createSimPlayer({
    id: player.id,
    displayName: player.displayName,
    level: player.level,
    xp: player.xp,
    houseLevel: player.houseLevel,
    race: player.race,
    playerClass: player.playerClass,
    gold: player.gold,
    units: { ...player.units },
    items: { ...player.items },
    upgrades: { ...player.upgrades },
    fortLevel: player.fortLevel,
    fortHp: player.fortHp,
    stamina: player.stamina,
    defensePressureToday: player.defensePressureToday,
    bonuses: {
      attack: player.bonuses.attack,
      defense: player.bonuses.defense,
    },
  });
}

function canAttackByLevel(
  attacker: PlayerState,
  defender: PlayerState,
  attackLevelRange = DEFAULT_ATTACK_LEVEL_RANGE,
): boolean {
  return (
    attacker.level >= defender.level - attackLevelRange &&
    attacker.level <= defender.level + attackLevelRange
  );
}

function spendLevelOneSpies(player: PlayerState, spiesLost: number): void {
  player.units.spy = Math.max(0, player.units.spy - Math.max(0, spiesLost));
}

function getRecentAttackCount(
  attacker: PlayerState,
  defenderId: string,
  currentTick: number,
  windowTicks: number,
): number {
  const history = attacker.attackHistory.get(defenderId) ?? [];
  const trimmed = trimTickHistory(history, currentTick, windowTicks);
  attacker.attackHistory.set(defenderId, trimmed);
  return trimmed.length;
}

function recordAttack(
  attacker: PlayerState,
  defenderId: string,
  currentTick: number,
  windowTicks: number,
): void {
  const history = attacker.attackHistory.get(defenderId) ?? [];
  const trimmed = trimTickHistory(history, currentTick, windowTicks);
  trimmed.push(currentTick);
  attacker.attackHistory.set(defenderId, trimmed);
}

function recordIncomingAttack(
  defender: PlayerState,
  attackerId: string,
  currentTick: number,
  windowTicks: number,
): void {
  const history = defender.incomingAttackHistory.get(attackerId) ?? [];
  const trimmed = trimTickHistory(history, currentTick, windowTicks);
  trimmed.push(currentTick);
  defender.incomingAttackHistory.set(attackerId, trimmed);
}

function recordTargetMemory(
  attacker: PlayerState,
  defenderId: string,
  currentTick: number,
  won: boolean,
  loot: number,
): void {
  const memory = attacker.targetMemory.get(defenderId) ?? {
    attacks: 0,
    wins: 0,
    lastLoot: 0,
    lastAttackTick: currentTick,
  };

  attacker.targetMemory.set(defenderId, {
    attacks: memory.attacks + 1,
    wins: memory.wins + (won ? 1 : 0),
    lastLoot: loot,
    lastAttackTick: currentTick,
  });
}

function tryBankDeposit(
  player: PlayerState,
  amount: number,
  currentTick: number,
  windowTicks: number,
): number {
  player.bankDepositHistory = trimTickHistory(
    player.bankDepositHistory,
    currentTick,
    windowTicks,
  );
  if (player.bankDepositHistory.length >= player.maximumBankDeposits) {
    return 0;
  }

  const depositAmount = Math.max(0, Math.min(Math.floor(amount), player.gold));
  if (depositAmount <= 0) return 0;

  player.gold -= depositAmount;
  player.goldInBank += depositAmount;
  player.bankDepositHistory.push(currentTick);
  return depositAmount;
}

function createDayResult(day: number): DayResult {
  return {
    day,
    totalAttacks: 0,
    totalIntelMissions: 0,
    totalAssassinations: 0,
    totalInfiltrations: 0,
    intelSuccessRate: 0,
    attackerWinRate: 0,
    defenderWinRate: 0,
    drawRate: 0,
    avgTurnsPerAttack: 0,
    totalLootTransferred: 0,
    totalAttackerCasualties: 0,
    totalDefenderCasualties: 0,
    levelUps: 0,
    playersDefeated: 0,
    avgFortDamage: 0,
    lowTurnAttacks: 0,
    highTurnAttacks: 0,
    attackTurnsGenerated: 0,
    attackTurnsSpent: 0,
    totalXpAwarded: 0,
    totalTurnIncome: 0,
    totalBankDeposits: 0,
    fortBreaches: 0,
    breachedPlayersEndOfDay: 0,
  };
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

function processDailyReset(state: SimulationState): void {
  for (const player of state.players.values()) {
    if (player.status !== 'active') continue;
    sanitizePlayerState(player);
    player.dailyLimits.attacksUsed = 0;
    player.dailyLimits.intelUsed = 0;
    player.dailyLimits.assassinationUsed = 0;
    player.dailyLimits.infiltrationUsed = 0;
    player.defensePressureToday = 0;
    player.spyPressureToday = 0;
    player.units.citizen += calculateRecruitBonus(player);
    player.maximumBankDeposits = calculateMaximumBankDeposits(player);
  }
}

async function processTurnTick(
  state: SimulationState,
  dayResult: DayResult,
  currentTick: number,
): Promise<{ intelAttempts: number; intelSuccesses: number }> {
  const windowTicks = getWindowTicks(state.config);
  const attackLevelRange = getAttackLevelRange(state.config);
  const random = state.config.random ?? Math.random;
  const players = Array.from(state.players.values()).filter(
    (player) => player.status === 'active',
  );

  for (const player of players) {
    const turnIncome = calculateTurnIncome(player);
    player.gold += turnIncome;
    player.attackTurns += 1;
    player.stamina = Math.min(player.maxStamina, player.stamina + 1);
    dayResult.totalTurnIncome += turnIncome;
    dayResult.attackTurnsGenerated += 1;

    player.bankDepositHistory = trimTickHistory(
      player.bankDepositHistory,
      currentTick,
      windowTicks,
    );
    for (const [defenderId, history] of player.attackHistory.entries()) {
      player.attackHistory.set(
        defenderId,
        trimTickHistory(history, currentTick, windowTicks),
      );
    }
    for (const [
      attackerId,
      history,
    ] of player.incomingAttackHistory.entries()) {
      player.incomingAttackHistory.set(
        attackerId,
        trimTickHistory(history, currentTick, windowTicks),
      );
    }
  }

  const shuffled = [...players].sort(() => random() - 0.5);
  let intelSuccesses = 0;
  let intelAttempts = 0;
  let attackWins = 0;
  let attackLosses = 0;
  let fortDamageThisTick = 0;
  let attackTurnsSpentThisTick = 0;

  for (const currentPlayer of shuffled) {
    const population = Array.from(state.players.values());
    const decision = makeDailyDecisions(currentPlayer, population, {
      attackLevelRange,
      currentDay: state.day,
      random,
    });

    for (const intel of decision.intelMissions) {
      const target = state.players.get(intel.target);
      if (!target || target.status !== 'active') continue;

      const result = await simulateSpyIntel(
        currentPlayer,
        target,
        intel.spyCount,
        random,
      );
      currentPlayer.dailyLimits.intelUsed++;
      currentPlayer.attackTurns = Math.max(0, currentPlayer.attackTurns - 1);
      currentPlayer.stamina = Math.max(0, currentPlayer.stamina - 1);
      target.spyPressureToday += 1;
      attackTurnsSpentThisTick += 1;
      spendLevelOneSpies(currentPlayer, result.spyCasualties);
      result.day = state.day;
      currentPlayer.intelCache.set(target.id, result);
      dayResult.totalIntelMissions++;
      intelAttempts++;
      if (result.success) intelSuccesses++;
    }

    for (const attack of decision.attacks) {
      const target = state.players.get(attack.target);
      if (!target || target.status !== 'active') continue;
      if (!canAttackByLevel(currentPlayer, target, attackLevelRange)) continue;
      if (currentPlayer.attackTurns < attack.turns) continue;
      if (currentPlayer.stamina < attack.turns) continue;
      if (
        getRecentAttackCount(
          currentPlayer,
          target.id,
          currentTick,
          windowTicks,
        ) >= 5
      ) {
        continue;
      }

      sanitizePlayerState(currentPlayer);
      sanitizePlayerState(target);
      const attackerSim = convertPlayerToSim(currentPlayer);
      const defenderSim = convertPlayerToSim(target);
      const result = await runSingleBattle(attackerSim, defenderSim, {
        ...createBattleConfigFromBalance(state.config.balance),
        maxTurns: Math.min(attack.turns, MAX_SIM_ATTACK_TURNS),
        random,
      });

      currentPlayer.attackTurns = Math.max(
        0,
        currentPlayer.attackTurns - attack.turns,
      );
      currentPlayer.stamina = Math.max(0, currentPlayer.stamina - attack.turns);
      currentPlayer.dailyLimits.attacksUsed++;
      recordAttack(currentPlayer, target.id, currentTick, windowTicks);
      recordIncomingAttack(target, currentPlayer.id, currentTick, windowTicks);
      recordTargetMemory(
        currentPlayer,
        target.id,
        currentTick,
        result.winner === 'attacker',
        result.loot,
      );
      attackTurnsSpentThisTick += attack.turns;

      const attackerLevelBefore = currentPlayer.level;
      const defenderLevelBefore = target.level;

      if (result.winner === 'attacker') {
        currentPlayer.gold += result.loot;
        target.gold = Math.max(0, target.gold - result.loot);
        Object.assign(
          currentPlayer,
          gainXp(currentPlayer, result.attackerXp, false),
        );
        Object.assign(target, gainXp(target, result.defenderXp, false));
        attackWins++;
      } else {
        Object.assign(
          currentPlayer,
          gainXp(currentPlayer, result.attackerXp, false),
        );
        Object.assign(target, gainXp(target, result.defenderXp, false));
        attackLosses++;
      }
      dayResult.totalXpAwarded += result.attackerXp + result.defenderXp;
      if (currentPlayer.level > attackerLevelBefore) {
        dayResult.levelUps += currentPlayer.level - attackerLevelBefore;
      }
      if (target.level > defenderLevelBefore) {
        dayResult.levelUps += target.level - defenderLevelBefore;
      }

      currentPlayer.units.soldier = Math.max(
        0,
        currentPlayer.units.soldier - result.attackerCasualties.soldier,
      );
      currentPlayer.units.knight = Math.max(
        0,
        currentPlayer.units.knight - result.attackerCasualties.knight,
      );
      currentPlayer.units.berserker = Math.max(
        0,
        currentPlayer.units.berserker - result.attackerCasualties.berserker,
      );

      target.units.soldier = Math.max(
        0,
        target.units.soldier - result.defenderCasualties.soldier,
      );
      target.units.knight = Math.max(
        0,
        target.units.knight - result.defenderCasualties.knight,
      );
      target.units.berserker = Math.max(
        0,
        target.units.berserker - result.defenderCasualties.berserker,
      );
      target.units.guard = Math.max(
        0,
        target.units.guard - result.defenderCasualties.guard,
      );
      target.units.archer = Math.max(
        0,
        target.units.archer - result.defenderCasualties.archer,
      );
      target.units.royalGuard = Math.max(
        0,
        target.units.royalGuard - result.defenderCasualties.royalGuard,
      );
      target.units.citizen = Math.max(
        0,
        target.units.citizen - result.defenderCasualties.citizen,
      );
      target.units.worker = Math.max(
        0,
        target.units.worker - result.defenderCasualties.worker,
      );
      target.fortHp = Math.max(0, target.fortHp - result.fortDamage);
      target.defensePressureToday += attack.turns;

      dayResult.totalAttacks++;
      dayResult.totalLootTransferred += result.loot;
      dayResult.totalAttackerCasualties +=
        result.attackerCasualties.soldier +
        result.attackerCasualties.knight +
        result.attackerCasualties.berserker;
      dayResult.totalDefenderCasualties +=
        result.defenderCasualties.soldier +
        result.defenderCasualties.knight +
        result.defenderCasualties.berserker +
        result.defenderCasualties.guard +
        result.defenderCasualties.archer +
        result.defenderCasualties.royalGuard +
        result.defenderCasualties.citizen +
        result.defenderCasualties.worker;
      dayResult.avgTurnsPerAttack += attack.turns;
      fortDamageThisTick += result.fortDamage;
      if (target.fortHp <= 0) {
        dayResult.fortBreaches++;
      }
      if (attack.turns <= 5) dayResult.lowTurnAttacks++;
      else dayResult.highTurnAttacks++;
    }

    const updatedPlayer = applyDecision(currentPlayer, decision);
    Object.assign(currentPlayer, updatedPlayer);

    if (
      decision.bankGold &&
      decision.bankGold > 0 &&
      currentPlayer.gold > 200000 &&
      currentPlayer.bankDepositHistory.length <
        currentPlayer.maximumBankDeposits
    ) {
      dayResult.totalBankDeposits += tryBankDeposit(
        currentPlayer,
        decision.bankGold,
        currentTick,
        windowTicks,
      );
    }

    sanitizePlayerState(currentPlayer);
  }

  dayResult.attackTurnsSpent += attackTurnsSpentThisTick;
  if (dayResult.totalAttacks > 0) {
    dayResult.attackerWinRate += attackWins;
    dayResult.defenderWinRate += attackLosses;
    dayResult.avgFortDamage += fortDamageThisTick;
  }
  return { intelAttempts, intelSuccesses };
}

function finalizeDayMetrics(
  state: SimulationState,
  dayResult: DayResult,
): DayResult {
  const totalResolvedAttacks =
    dayResult.attackerWinRate + dayResult.defenderWinRate;
  if (totalResolvedAttacks > 0) {
    dayResult.attackerWinRate /= totalResolvedAttacks;
    dayResult.defenderWinRate /= totalResolvedAttacks;
    dayResult.avgTurnsPerAttack /= totalResolvedAttacks;
    dayResult.avgFortDamage /= totalResolvedAttacks;
  } else {
    dayResult.attackerWinRate = 0;
    dayResult.defenderWinRate = 0;
    dayResult.avgTurnsPerAttack = 0;
    dayResult.avgFortDamage = 0;
  }

  dayResult.breachedPlayersEndOfDay = Array.from(state.players.values()).filter(
    (player) => player.fortHp <= 0,
  ).length;

  return dayResult;
}

/** Simulate day. */
export async function simulateDay(state: SimulationState): Promise<DayResult> {
  const day = state.day + 1;
  const dayResult = createDayResult(day);
  const ticksPerDay = getTicksPerDay(state.config);
  let totalIntelAttempts = 0;
  let totalIntelSuccesses = 0;

  processDailyReset(state);

  for (let tick = 0; tick < ticksPerDay; tick++) {
    const currentTick = state.day * ticksPerDay + tick;
    const tickResult = await processTurnTick(state, dayResult, currentTick);
    totalIntelAttempts += tickResult.intelAttempts;
    totalIntelSuccesses += tickResult.intelSuccesses;
  }

  dayResult.intelSuccessRate =
    totalIntelAttempts > 0 ? totalIntelSuccesses / totalIntelAttempts : 0;

  finalizeDayMetrics(state, dayResult);
  state.day = day;
  state.history.push(dayResult);
  return dayResult;
}

/** Run simulation. */
export async function runSimulation(
  population: PlayerState[],
  days: number,
  config: SimulationConfig = {},
): Promise<SimulationState> {
  const simulationConfig: SimulationConfig = {
    ...config,
    random:
      config.random ??
      (config.seed != null ? createSeededRandom(config.seed) : undefined),
  };
  const players = new Map<string, PlayerState>();
  for (const player of population) {
    const clone = clonePlayer(player);
    players.set(clone.id, clone);
  }

  const state: SimulationState = {
    players,
    day: 0,
    totalDays: days,
    history: [],
    metrics: createPopulationMetrics(),
    config: simulationConfig,
  };

  for (let d = 0; d < days; d++) {
    const dayResult = await simulateDay(state);

    if (config.logLevel === 'info' || config.logLevel === 'debug') {
      console.log(
        `Day ${dayResult.day}: Attacks=${dayResult.totalAttacks}, ` +
          `AtkWin=${(dayResult.attackerWinRate * 100).toFixed(1)}%, ` +
          `TurnsGen=${dayResult.attackTurnsGenerated}, TurnsSpent=${dayResult.attackTurnsSpent}`,
      );
    }

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
    let activePlayers = 0;
    let breachedPlayers = 0;
    let totalHeldTurns = 0;
    const levelDist = new Map<number, number>();

    for (const player of state.players.values()) {
      if (player.status === 'active') {
        totalGold += player.gold + player.goldInBank;
        activePlayers++;
      }
      if (player.fortHp <= 0) {
        breachedPlayers++;
      }
      totalHeldTurns += player.attackTurns;
      levelDist.set(player.level, (levelDist.get(player.level) ?? 0) + 1);
    }

    state.metrics.totalGoldInEconomy.push(totalGold);
    state.metrics.activePlayersPerDay.push(activePlayers);
    state.metrics.defeatedPlayersPerDay.push(0);
    state.metrics.breachedPlayersPerDay.push(breachedPlayers);
    state.metrics.attackTurnsHeldPerDay.push(
      activePlayers > 0 ? totalHeldTurns / activePlayers : 0,
    );
    state.metrics.levelDistributionOverTime.push(levelDist);
  }

  return state;
}

/** Print simulation summary. */
export function printSimulationSummary(state: SimulationState): void {
  console.log('\n=== Simulation Summary ===');
  console.log(`Days: ${state.totalDays}`);
  console.log(`Final Day: ${state.day}`);

  const results = state.metrics.dailyResults;
  if (results.length === 0) {
    console.log('No results recorded.');
    return;
  }

  const avgAttacks =
    results.reduce((sum, result) => sum + result.totalAttacks, 0) /
    results.length;
  const avgWinRate =
    results.reduce((sum, result) => sum + result.attackerWinRate, 0) /
    results.length;
  const avgIntel =
    results.reduce((sum, result) => sum + result.intelSuccessRate, 0) /
    results.length;
  const avgLoot =
    results.reduce((sum, result) => sum + result.totalLootTransferred, 0) /
    results.length;
  const avgHeldTurns =
    state.metrics.attackTurnsHeldPerDay.reduce((sum, value) => sum + value, 0) /
    Math.max(state.metrics.attackTurnsHeldPerDay.length, 1);
  const breachedFinal =
    state.metrics.breachedPlayersPerDay[
      state.metrics.breachedPlayersPerDay.length - 1
    ] ?? 0;

  console.log(`\nAverage per day:`);
  console.log(`  Attacks: ${avgAttacks.toFixed(1)}`);
  console.log(`  Attacker Win Rate: ${(avgWinRate * 100).toFixed(1)}%`);
  console.log(`  Intel Success Rate: ${(avgIntel * 100).toFixed(1)}%`);
  console.log(`  Loot Transferred: ${(avgLoot / 1000000).toFixed(2)}M gold`);
  console.log(`  Attack Turns Held: ${avgHeldTurns.toFixed(1)}`);
  console.log(`\nWorld State:`);
  console.log(`  Players: ${state.players.size}`);
  console.log(`  Breached Forts: ${breachedFinal}`);
  console.log('=================================\n');
}
