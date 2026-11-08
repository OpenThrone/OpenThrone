import { multiplyCount } from '../constants/gameEvents';
import { V5_COMBAT_CONSTANTS } from '../utils/balance/v5Combat';
import { DEFAULT_STAMINA_RULES, staminaCost } from '../utils/stamina';
import { applyDecision, makeDailyDecisions } from './behaviors';
import {
  battleDailyBudget,
  recordBattleOnLedger,
  resetDefenderDailyLedger,
} from './dailyLedger';
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
import {
  assertPlayerGold,
  type InvariantContext,
  SimulationConfigError,
} from './invariants';
import {
  allocateBonusPoints,
  applyBattleMorale,
  applyDailyMorale,
  applyDefection,
  type EventDiscounts,
  spendOnArmy,
} from './liveEconomy';
import {
  applyMercenaryLosses,
  captureFromBattle,
  desertMercenaries,
  mercenaryRoster,
  processCaptives,
  startMercenaryDay,
} from './liveForces';
import {
  activeEvent,
  areAllied,
  bankBeforeLogoff,
  buyNextStructure,
  healWounded,
  houseIndex,
  isProtectedLive,
  liveDailyCitizens,
  liveIncomeBonus,
  liveRepairCost,
  MAX_ROUNDS_PER_SESSION,
  planSessionTicks,
  recordWounded,
} from './liveRules';
import { createLivePowerEstimator } from './liveTargeting';
import { createSimPlayer } from './presets';
import {
  createDefaultRandom,
  createRng,
  createValidatedRandom,
  DEFAULT_SIM_SEED,
  shuffleWithRandom,
} from './random';
import {
  applyDefenderDailyCap,
  type DailyCasualtyCapUsage,
  getRuleset,
  type RebuildShieldState,
} from './rulesets';
import type { RulesetId } from './scenarioTypes';
import {
  recordSpyMissionTick,
  trackerPerTargetCount,
  trackerWithRollingHistory,
} from './spyBehavior';
import type {
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

export interface EraDayOptions {
  readonly rulesetId: RulesetId;
  readonly dailyCasualtyCapUsage: Map<string, DailyCasualtyCapUsage>;
  readonly rebuildShields: ReadonlyMap<string, RebuildShieldState>;
  /** Persona-managed ERA runs retain legacy target selection but never let
   * legacy per-tick recruitment, upgrades, repairs, or banking compete with
   * the single daily persona economic decision. */
  readonly personaManagedEconomy?: boolean;
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
    0,
    Math.floor(sanitizeNumber(player.houseLevel, 0)),
  );
  player.spyLevel = Math.max(1, Math.floor(sanitizeNumber(player.spyLevel, 1)));
  player.sentryLevel = Math.max(
    1,
    Math.floor(sanitizeNumber(player.sentryLevel, 1)),
  );
  player.economyLevel = Math.max(
    0,
    Math.floor(sanitizeNumber(player.economyLevel, 0)),
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
    ...(player.defenderLedger
      ? {
          defenderLedger: {
            ...player.defenderLedger,
            typeCasualtiesToday: {
              ...player.defenderLedger.typeCasualtiesToday,
            },
          },
        }
      : {}),
    ...(player.spyMissionTicks
      ? {
          spyMissionTicks: new Map(
            Array.from(player.spyMissionTicks.entries()).map(([key, value]) => [
              key,
              [...value],
            ]),
          ),
        }
      : {}),
  };
}

function convertPlayerToSim(player: PlayerState, live = false) {
  return createSimPlayer({
    id: player.id,
    displayName: player.displayName,
    level: player.level,
    xp: player.xp,
    // The battle code expects the 0-based HouseUpgrades index.
    houseLevel: live ? houseIndex(player) : player.houseLevel,
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
    live: live
      ? {
          inventory: player.inventory ?? [],
          structureUpgrades: [
            { type: 'ARMORY', level: player.armoryLevel ?? 1 },
            { type: 'OFFENSE', level: player.offenseStructureLevel ?? 1 },
          ],
          battleUpgrades: player.battleUpgrades ?? [],
          mercenaries: mercenaryRoster(player),
        }
      : undefined,
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

function applySpyCasualtyDeltas(
  player: PlayerState,
  deltas: Partial<PlayerState['units']> = {},
): void {
  for (const [type, delta] of Object.entries(deltas)) {
    const key = type as keyof PlayerState['units'];
    player.units[key] = Math.max(0, player.units[key] + delta);
  }
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
  context: InvariantContext,
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
  assertPlayerGold(player, context);
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
  const ctx = { day: state.day + 1, playerId: '' };
  const random = createValidatedRandom(
    state.config.random ?? createDefaultRandom(),
  );
  const event = activeEvent(state.config.event, state.day + 1);
  // Defectors each recipient has accepted today, across deserting kingdoms.
  const defectorsReceived = new Map<string, number>();
  for (const player of state.players.values()) {
    if (player.status !== 'active') continue;
    ctx.playerId = player.id;
    assertPlayerGold(player, ctx);
    sanitizePlayerState(player);
    player.dailyLimits.attacksUsed = 0;
    player.dailyLimits.intelUsed = 0;
    player.dailyLimits.assassinationUsed = 0;
    player.dailyLimits.infiltrationUsed = 0;
    player.defensePressureToday = 0;
    player.spyPressureToday = 0;
    resetDefenderDailyLedger(player);
    player.maximumBankDeposits = calculateMaximumBankDeposits(player);
    if (state.config.live) {
      player.units.citizen += multiplyCount(
        liveDailyCitizens(player),
        event?.citizenMultiplier ?? 1,
        random,
      );
      healWounded(player);
      const mercenaryMorale = startMercenaryDay(player, state.day);
      if (state.config.dungeon) {
        processCaptives(player, state.players, state.day);
      }
      // One combined daily morale change, then both desertion checks (KingdomMorale.service).
      const { deserted, defectors } = applyDailyMorale(player, mercenaryMorale);
      desertMercenaries(player);
      if (deserted > 0) {
        if (player.simStats) player.simStats.deserted += deserted;
        // Defectors go to whoever attacked this player most in the last day.
        const top = Array.from(player.incomingAttackHistory.entries()).sort(
          (a, b) => b[1].length - a[1].length,
        )[0];
        const recipient = top ? state.players.get(top[0]) : undefined;
        if (recipient && top[1].length > 0) {
          const received = defectorsReceived.get(recipient.id) ?? 0;
          defectorsReceived.set(
            recipient.id,
            received + applyDefection(recipient, defectors, received),
          );
        }
      }
      player.sessionTicks = planSessionTicks(
        player.activity ?? 'regular',
        getTicksPerDay(state.config),
        random,
      );
    } else {
      player.units.citizen += calculateRecruitBonus(player);
    }
  }
}

async function processTurnTick(
  state: SimulationState,
  dayResult: DayResult,
  currentTick: number,
  eraOptions?: EraDayOptions,
): Promise<{ intelAttempts: number; intelSuccesses: number }> {
  const windowTicks = getWindowTicks(state.config);
  const attackLevelRange = getAttackLevelRange(state.config);
  const random = createValidatedRandom(
    state.config.random ?? createDefaultRandom(),
  );
  const invariantContext = { day: state.day + 1, playerId: '' };
  const players = Array.from(state.players.values()).filter(
    (player) => player.status === 'active',
  );

  const liveIncome = state.config.live === true;
  const event = activeEvent(state.config.event, state.day + 1);
  for (const player of players) {
    const baseIncome = liveIncome
      ? Math.ceil(
          calculateTurnIncome(player) * (1 + liveIncomeBonus(player) / 100),
        )
      : calculateTurnIncome(player);
    // As CronJob.service: the event gold multiplier, rounded down.
    const turnIncome = event
      ? Math.floor(baseIncome * event.goldMultiplier)
      : baseIncome;
    player.gold += turnIncome;
    invariantContext.playerId = player.id;
    assertPlayerGold(player, invariantContext);
    const turnsThisTick = 1 + (event?.extraTurnsPerTick ?? 0);
    player.attackTurns += turnsThisTick;
    if (player.simStats) player.simStats.turnsGenerated += turnsThisTick;
    player.stamina = Math.min(player.maxStamina, player.stamina + 1);
    dayResult.totalTurnIncome += turnIncome;
    dayResult.attackTurnsGenerated += turnsThisTick;

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

  const shuffled = shuffleWithRandom(random, players);
  let intelSuccesses = 0;
  let intelAttempts = 0;
  let attackWins = 0;
  let attackLosses = 0;
  let fortDamageThisTick = 0;
  let attackTurnsSpentThisTick = 0;

  const live = state.config.live === true;
  const tickOfDay = currentTick - state.day * getTicksPerDay(state.config);
  const discounts = {
    unit: event?.unitCostDiscountPercent ?? 0,
    armory: event?.armoryCostDiscountPercent ?? 0,
  };
  // Defense strengths for live target estimates, computed once per tick.
  const defenseCache = new Map<string, number>();

  // One round of decisions. Returns whether the player attacked or spied.
  const runRound = async (currentPlayer: PlayerState): Promise<boolean> => {
    let acted = false;
    // Alliance members leave each other alone.
    const population = Array.from(state.players.values()).filter(
      (player) =>
        !live || player === currentPlayer || !areAllied(currentPlayer, player),
    );
    const legacyDecision = makeDailyDecisions(currentPlayer, population, {
      attackLevelRange,
      currentDay: state.day,
      random,
      forceAct: live,
      livePower: live
        ? createLivePowerEstimator(currentPlayer, defenseCache)
        : undefined,
    });
    // Live players buy structures and bank through liveRules instead.
    const managedDecision = {
      ...legacyDecision,
      upgradeSpy: undefined,
      upgradeSentry: undefined,
      upgradeEconomy: undefined,
      repairFort: undefined,
      bankGold: undefined,
    };
    // Live players train and equip through liveEconomy at login and logoff.
    const decision =
      eraOptions?.personaManagedEconomy || live
        ? { ...managedDecision, recruitment: {} }
        : legacyDecision;

    for (const intel of decision.intelMissions) {
      const target = state.players.get(intel.target);
      if (!target || target.status !== 'active') continue;
      // Production caps intel per attacker and defender over a rolling 24h.
      const intelTracker = trackerWithRollingHistory(
        currentPlayer,
        currentTick,
        windowTicks,
      );
      if (
        trackerPerTargetCount(intelTracker, target.id, 'intel') >=
        V5_COMBAT_CONSTANTS.INTEL_MAX_PER_TARGET_PER_DAY
      ) {
        continue;
      }

      const result = await simulateSpyIntel(
        currentPlayer,
        target,
        intel.spyCount,
        random,
      );
      currentPlayer.dailyLimits.intelUsed++;
      currentPlayer.attackTurns = Math.max(0, currentPlayer.attackTurns - 1);
      target.spyPressureToday += 1;
      recordSpyMissionTick(
        currentPlayer,
        'intel',
        target.id,
        currentTick,
        windowTicks,
      );
      attackTurnsSpentThisTick += 1;
      applySpyCasualtyDeltas(currentPlayer, result.attackerCasualtyDeltas);
      applySpyCasualtyDeltas(target, result.defenderCasualtyDeltas);
      result.day = state.day;
      currentPlayer.intelCache.set(target.id, result);
      if (live && result.success && currentPlayer.allianceId) {
        // Alliance members share fresh spy reports.
        for (const ally of state.players.values()) {
          if (ally !== currentPlayer && areAllied(ally, currentPlayer)) {
            ally.intelCache.set(target.id, result);
          }
        }
      }
      dayResult.totalIntelMissions++;
      intelAttempts++;
      if (result.success) intelSuccesses++;
      if (currentPlayer.simStats) currentPlayer.simStats.turnsSpent += 1;
      acted = true;
    }

    for (const attack of decision.attacks) {
      const target = state.players.get(attack.target);
      if (!target || target.status !== 'active') continue;
      if (live && areAllied(currentPlayer, target)) continue;
      const shield = eraOptions?.rebuildShields.get(target.id);
      if (shield && !shield.expired) continue;
      if (!canAttackByLevel(currentPlayer, target, attackLevelRange)) continue;
      if (currentPlayer.attackTurns < attack.turns) continue;
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

      invariantContext.playerId = currentPlayer.id;
      assertPlayerGold(currentPlayer, invariantContext);
      invariantContext.playerId = target.id;
      assertPlayerGold(target, invariantContext);
      sanitizePlayerState(currentPlayer);
      sanitizePlayerState(target);
      const attackerSim = convertPlayerToSim(currentPlayer, live);
      const defenderSim = convertPlayerToSim(target, live);
      const targetProtected = live && isProtectedLive(target, state.day);
      const result = await runSingleBattle(attackerSim, defenderSim, {
        ...createBattleConfigFromBalance(state.config.balance),
        ...battleDailyBudget(
          target,
          live ? { isProtected: targetProtected } : undefined,
        ),
        ...(live ? { isDefenderProtected: targetProtected } : {}),
        maxTurns: Math.min(attack.turns, MAX_SIM_ATTACK_TURNS),
        random,
        rulesetId: eraOptions?.rulesetId,
        dailyCasualtyCapUsage: eraOptions?.dailyCasualtyCapUsage.get(target.id),
        defenderStartOfDayPopulation: eraOptions?.dailyCasualtyCapUsage.get(
          target.id,
        )?.startOfDayPopulation,
      });

      if (eraOptions?.dailyCasualtyCapUsage.has(target.id)) {
        const usage = eraOptions.dailyCasualtyCapUsage.get(target.id);
        if (usage) {
          const pending = Object.values(result.defenderCasualties).reduce(
            (sum, casualties) => sum + casualties,
            0,
          );
          const next = applyDefenderDailyCap({
            manifest: getRuleset(eraOptions.rulesetId),
            usage,
            pendingCasualties: pending,
          });
          eraOptions.dailyCasualtyCapUsage.set(target.id, next.usage);
        }
      }

      recordBattleOnLedger(target, result);
      if (event) {
        // As AttackService: event XP for both sides, rounded down.
        result.attackerXp = Math.floor(result.attackerXp * event.xpMultiplier);
        result.defenderXp = Math.floor(result.defenderXp * event.xpMultiplier);
      }
      currentPlayer.attackTurns = Math.max(
        0,
        currentPlayer.attackTurns - attack.turns,
      );
      currentPlayer.stamina = Math.max(
        0,
        currentPlayer.stamina -
          staminaCost(
            attack.turns,
            DEFAULT_STAMINA_RULES,
            currentPlayer.offenseStructureLevel ?? 1,
          ),
      );
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
        invariantContext.playerId = currentPlayer.id;
        assertPlayerGold(currentPlayer, invariantContext);
        invariantContext.playerId = target.id;
        assertPlayerGold(target, invariantContext);
        Object.assign(
          currentPlayer,
          gainXp(currentPlayer, result.attackerXp, false, live),
        );
        Object.assign(target, gainXp(target, result.defenderXp, false, live));
        attackWins++;
      } else {
        Object.assign(
          currentPlayer,
          gainXp(currentPlayer, result.attackerXp, false, live),
        );
        Object.assign(target, gainXp(target, result.defenderXp, false, live));
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
      if (live) {
        const pick = (
          wounded: PlayerState['units'] | undefined,
          keys: Array<keyof PlayerState['units']>,
        ) => Object.fromEntries(keys.map((key) => [key, wounded?.[key] ?? 0]));
        recordWounded(
          currentPlayer,
          pick(result.attackerWounded, ['soldier', 'knight', 'berserker']),
        );
        recordWounded(
          target,
          pick(result.defenderWounded, [
            'soldier',
            'knight',
            'berserker',
            'guard',
            'archer',
            'royalGuard',
            'citizen',
            'worker',
          ]),
        );
        const attackerWon = result.winner === 'attacker';
        applyBattleMorale(target, attackerWon, targetProtected);
        if (currentPlayer.simStats) {
          currentPlayer.simStats.attacks += 1;
          currentPlayer.simStats.turnsSpent += attack.turns;
          if (attackerWon) {
            currentPlayer.simStats.attackWins += 1;
            currentPlayer.simStats.lootGained += result.loot;
          }
        }
        if (target.simStats) {
          target.simStats.defenses += 1;
          if (attackerWon) target.simStats.lootLost += result.loot;
          else target.simStats.defenseWins += 1;
        }
      }
      acted = true;

      const fortWasStanding = target.fortHp > 0;
      target.fortHp = Math.max(0, target.fortHp - result.fortDamage);
      target.defensePressureToday += attack.turns;
      if (live) {
        const killedOnly = (
          losses: Record<number, number> | undefined,
          wounded: Record<number, number> | undefined,
        ) =>
          Object.fromEntries(
            Object.entries(losses ?? {}).map(([id, count]) => [
              id,
              count - (wounded?.[Number(id)] ?? 0),
            ]),
          );
        applyMercenaryLosses(
          currentPlayer,
          killedOnly(
            result.attackerMercenaryLosses,
            result.attackerMercenaryWounded,
          ),
          result.attackerMercenaryWounded,
        );
        applyMercenaryLosses(
          target,
          killedOnly(
            result.defenderMercenaryLosses,
            result.defenderMercenaryWounded,
          ),
          result.defenderMercenaryWounded,
        );
        if (state.config.dungeon) {
          const killed = Object.fromEntries(
            Object.entries(result.defenderCasualties).map(([key, count]) => [
              key,
              count -
                (result.defenderWounded?.[key as keyof PlayerState['units']] ??
                  0),
            ]),
          );
          captureFromBattle({
            attacker: currentPlayer,
            defender: target,
            attackerWon: result.winner === 'attacker',
            fortBreached: target.fortHp <= 0,
            defenderProtected: targetProtected,
            killed,
            day: state.day,
          });
        }
      }

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
      // Count the attack that brings the walls down, not every hit after.
      if (fortWasStanding && target.fortHp <= 0) {
        dayResult.fortBreaches++;
      }
      if (attack.turns <= 5) dayResult.lowTurnAttacks++;
      else dayResult.highTurnAttacks++;
    }

    invariantContext.playerId = currentPlayer.id;
    const updatedPlayer = applyDecision(
      currentPlayer,
      decision,
      invariantContext,
    );
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
        invariantContext,
      );
    }

    invariantContext.playerId = currentPlayer.id;
    assertPlayerGold(currentPlayer, invariantContext);
    sanitizePlayerState(currentPlayer);
    assertPlayerGold(currentPlayer, invariantContext);
    return acted;
  };

  for (const currentPlayer of shuffled) {
    if (!live) {
      await runRound(currentPlayer);
      continue;
    }
    // Live players act only while logged in, spending held turns in rounds.
    if (!currentPlayer.sessionTicks?.has(tickOfDay)) continue;
    if (currentPlayer.simStats) currentPlayer.simStats.sessions += 1;
    allocateBonusPoints(currentPlayer);
    spendOnArmy(
      currentPlayer,
      getTicksPerDay(state.config),
      discounts,
      state.day,
    );
    for (let round = 0; round < MAX_ROUNDS_PER_SESSION; round++) {
      if (!(await runRound(currentPlayer))) break;
    }
    invariantContext.playerId = currentPlayer.id;
    finishLiveSession(
      currentPlayer,
      currentTick,
      getTicksPerDay(state.config),
      dayResult,
      discounts,
      state.day,
    );
    assertPlayerGold(currentPlayer, invariantContext);
  }

  dayResult.attackTurnsSpent += attackTurnsSpentThisTick;
  if (dayResult.totalAttacks > 0) {
    dayResult.attackerWinRate += attackWins;
    dayResult.defenderWinRate += attackLosses;
    dayResult.avgFortDamage += fortDamageThisTick;
  }
  return { intelAttempts, intelSuccesses };
}

/** Before logging off a live player repairs, buys structures and banks gold. */
function finishLiveSession(
  player: PlayerState,
  currentTick: number,
  ticksPerDay: number,
  dayResult: DayResult,
  discounts: EventDiscounts,
  day: number,
): void {
  const repairCost = liveRepairCost(player);
  if (repairCost > 0 && repairCost <= (player.gold + player.goldInBank) * 0.5) {
    const fromHand = Math.min(player.gold, repairCost);
    player.gold -= fromHand;
    player.goldInBank -= repairCost - fromHand;
    player.fortHp = player.fortMaxHp;
  }
  for (let purchases = 0; purchases < 3; purchases++) {
    if (buyNextStructure(player) <= 0) break;
  }
  spendOnArmy(player, ticksPerDay, discounts, day);
  dayResult.totalBankDeposits += bankBeforeLogoff(
    player,
    currentTick,
    ticksPerDay,
  );
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
export async function simulateDay(
  state: SimulationState,
  eraOptions?: EraDayOptions,
): Promise<DayResult> {
  const day = state.day + 1;
  const dayResult = createDayResult(day);
  const ticksPerDay = getTicksPerDay(state.config);
  let totalIntelAttempts = 0;
  let totalIntelSuccesses = 0;

  processDailyReset(state);

  for (let tick = 0; tick < ticksPerDay; tick++) {
    const currentTick = state.day * ticksPerDay + tick;
    const tickResult = await processTurnTick(
      state,
      dayResult,
      currentTick,
      eraOptions,
    );
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
  const seed = config.seed ?? DEFAULT_SIM_SEED;
  const simulationConfig: SimulationConfig = {
    ...config,
    seed,
    random: createValidatedRandom(config.random ?? createRng(seed).next),
  };
  const initialContext = { day: 0, playerId: '' };
  const players = new Map<string, PlayerState>();
  for (const player of population) {
    initialContext.playerId = player.id;
    assertPlayerGold(player, initialContext);
    if (players.has(player.id)) {
      throw new SimulationConfigError(
        `Duplicate player ID "${player.id}" in simulation population`,
        'duplicate-player-id',
        player.id,
      );
    }
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
