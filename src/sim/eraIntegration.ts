import {
  ALLIANCE_AID_TREASURY_FRACTION,
  authorizeTreasuryAid,
  buildAllianceManifests,
  createAllianceStates,
  depositToTreasury,
  estimateTrailing7dIncome,
  isIntelFresh,
  nominateFocusTarget,
  planCoordinatedAttack,
  shareFreshIntel,
} from './alliances';
import { applyDecision } from './behaviors';
import { type CohortMetricRecord, collectCohortMetrics } from './cohortMetrics';
import { runSimulation, simulateDay } from './daycycle';
import { calculateTurnIncome, getPlayerPower } from './economy';
import {
  createEraCohort,
  createLateJoiner,
  PRIMARY_COHORT_MANIFEST,
} from './eraPopulation';
import {
  calculateItemCoverage,
  chooseCombatPosture,
  type EraCombatPosture,
  purchaseItemStockpile,
} from './eraStrategy';
import { generateRecruitmentEvents } from './externalRecruitment';
import { assertPlayerGold, SimulationConfigError } from './invariants';
import {
  type ActivitySchedule,
  type AdaptationState,
  adaptTactics,
  computeInactivityProbability,
  computeTrailingPeak,
  createInitialActivitySchedule,
  createInitialAdaptationState,
  createInitialInactivityState,
  createInitialMeaningfulActionLog,
  createInitialRecoveryTracker,
  createInitialStrategicPowerHistory,
  enterRebuilding,
  evaluateDailyActivity,
  evaluateInactivity,
  evaluateReactivation,
  type InactivityState,
  type MeaningfulActionLog,
  recordAdaptationOutcome,
  recordMeaningfulAction,
  recordStrategicPowerSample,
  type RecoveryTracker,
  shouldAdapt,
  shouldWipe,
  type StrategicPowerHistory,
  updateRecoveryTracker,
  type WipeBaseline,
} from './lifecycle';
import {
  buildPersonaObservation,
  createInitialTacticalState,
  decidePersonaPolicy,
  EMPTY_THREAT_SIGNALS,
  personaDecisionToAgentDecision,
  type PersonaTacticalState,
  type PersonaThreatSignals,
} from './personas';
import { createRng, type Rng } from './random';
import { advanceRebuildShield, getRuleset } from './rulesets';
import {
  createEmptyCumulativeCounters,
  type EraPlayerScenarioState,
  type EraPlayerState,
  type EraScenarioManifest,
  type EraScenarioState,
  type EraSimulationConfig,
  type ScenarioCheckpoint,
} from './scenarioTypes';
import {
  dailyLimitsToTracker,
  executeSpyMission,
  planSpyApplication,
  planSpyMissions,
  playerStateToSpyLimits,
} from './spyBehavior';
import type { PlayerState, SimulationState, UnitCounts } from './types';

const ERA_CHECKPOINT_DAYS = new Set([
  0, 1, 7, 14, 30, 60, 90, 180, 365, 545, 730,
]);
const TICKS_PER_DAY = 48;
const DEFAULT_ATTACK_LEVEL_RANGE = 5;

interface PlayerEraRuntime {
  activity: ActivitySchedule;
  inactivity: InactivityState;
  meaningfulActions: MeaningfulActionLog;
  powerHistory: StrategicPowerHistory;
  wipeBaseline: WipeBaseline | null;
  recovery: RecoveryTracker;
  adaptation: AdaptationState;
  tactical: PersonaTacticalState;
  signals: PersonaThreatSignals;
  posture: EraCombatPosture;
  dailySamples: DailySignalSample[];
  dayStart: DayStartSnapshot | null;
}

interface DayStartSnapshot {
  readonly workerCount: number;
  readonly fortHp: number;
  readonly incomingAttackCount: number;
}

interface DailySignalSample {
  readonly day: number;
  readonly income: number;
  readonly loot: number;
  readonly workersLost: number;
  readonly attacksSuffered: number;
  readonly breached: boolean;
  readonly incomingAttackers: number;
}

export interface EraSimulationRunState {
  readonly base: SimulationState;
  readonly scenario: EraScenarioState;
  readonly config: EraSimulationConfig;
  readonly runtime: Map<string, PlayerEraRuntime>;
  readonly rng: Rng;
  readonly alliances: ReturnType<typeof createAllianceStates>;
  readonly lateJoiners: Map<number, EraPlayerState[]>;
  readonly checkpointMetrics: CohortMetricRecord[];
}

export interface RunEraSimulationOptions {
  readonly manifest?: EraScenarioManifest;
  readonly players?: readonly EraPlayerState[];
  readonly days?: number;
  readonly config?: EraSimulationConfig;
  readonly lateJoiners?: readonly EraPlayerState[];
}

function defaultManifest(days: number, seed: number): EraScenarioManifest {
  return {
    id: 'era-default',
    rulesetId: 'production',
    seed,
    totalDays: days,
    primaryCohort: PRIMARY_COHORT_MANIFEST,
    recruitment: {
      rewardsPerDay: 25,
      band: 25,
      recipientMode: 'self',
      selectionShare: 0.75,
    },
    allianceMode: 'none',
    lateJoinerDays: [30, 90, 180, 365],
    calibrationStatus: 'uncalibrated',
  };
}

function createRuntime(
  meta: EraPlayerScenarioState,
  rng: Rng,
): PlayerEraRuntime {
  const originalActivityClass =
    meta.activityClass === 'passive' ? 'passive' : 'active';
  return {
    activity: createInitialActivitySchedule({
      activityClass: meta.activityClass,
      joinedOnDay: meta.joinedOnDay,
      rng,
    }),
    inactivity: createInitialInactivityState(originalActivityClass),
    meaningfulActions: createInitialMeaningfulActionLog(),
    powerHistory: createInitialStrategicPowerHistory(),
    wipeBaseline: null,
    recovery: createInitialRecoveryTracker(),
    adaptation: createInitialAdaptationState(),
    tactical: createInitialTacticalState(meta.persona, meta.farmerVariant),
    signals: { ...EMPTY_THREAT_SIGNALS },
    posture: 'idle-defending',
    dailySamples: [],
    dayStart: null,
  };
}

function snapshotCheckpoint(state: EraSimulationRunState): ScenarioCheckpoint {
  const snapshots = Array.from(state.base.players.values())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((player) => {
      const meta = state.scenario.playerMeta.get(player.id);
      if (!meta) {
        throw new SimulationConfigError(
          `Missing ERA metadata for player ${player.id}`,
          'era-metadata-missing',
          player.id,
        );
      }
      return {
        cohortId: meta.cohortId,
        persona: meta.persona,
        activityClass: meta.activityClass,
        citizens: player.units.citizen,
        workers: player.units.worker,
        handGold: player.gold,
        bankGold: player.goldInBank,
        fortLevel: player.fortLevel,
        strategicPower: getPlayerPower(player),
      };
    });
  return { day: state.base.day, cohortSnapshots: snapshots };
}

function appendBaseMetrics(base: SimulationState): void {
  const dayResult = base.history[base.history.length - 1];
  if (!dayResult) return;
  const { metrics } = base;
  metrics.dailyResults.push(dayResult);
  metrics.attackerWinRateOverTime.push(dayResult.attackerWinRate);
  metrics.defenderWinRateOverTime.push(dayResult.defenderWinRate);
  metrics.intelSuccessRateOverTime.push(dayResult.intelSuccessRate);
  metrics.avgTurnsPerAttack.push(dayResult.avgTurnsPerAttack);
  metrics.lowTurnVsHighTurnRatio.push(
    dayResult.highTurnAttacks > 0
      ? dayResult.lowTurnAttacks / dayResult.highTurnAttacks
      : 0,
  );

  let totalGold = 0;
  let active = 0;
  let defeated = 0;
  let breached = 0;
  let heldTurns = 0;
  const levelDistribution = new Map<number, number>();
  for (const player of base.players.values()) {
    assertPlayerGold(player, { day: base.day, playerId: player.id });
    totalGold += player.gold + player.goldInBank;
    heldTurns += player.attackTurns;
    if (player.status === 'active') active += 1;
    if (player.status === 'defeated') defeated += 1;
    if (player.fortHp <= 0) breached += 1;
    levelDistribution.set(
      player.level,
      (levelDistribution.get(player.level) ?? 0) + 1,
    );
  }
  metrics.totalGoldInEconomy.push(totalGold);
  metrics.activePlayersPerDay.push(active);
  metrics.defeatedPlayersPerDay.push(defeated);
  metrics.breachedPlayersPerDay.push(breached);
  metrics.attackTurnsHeldPerDay.push(active > 0 ? heldTurns / active : 0);
  metrics.levelDistributionOverTime.push(levelDistribution);
}

function addLateJoiner(
  state: EraSimulationRunState,
  player: EraPlayerState,
): void {
  if (state.base.players.has(player.id)) {
    throw new SimulationConfigError(
      `Late joiner ${player.id} duplicates an existing player id`,
      'era-late-joiner-duplicate-id',
      player.id,
    );
  }
  const {
    persona,
    farmerVariant,
    activityClass,
    lifecycleStatus,
    cohortId,
    joinedOnDay,
    ...basePlayer
  } = player;
  state.base.players.set(basePlayer.id, basePlayer);
  const meta: EraPlayerScenarioState = {
    persona,
    farmerVariant,
    activityClass,
    lifecycleStatus:
      lifecycleStatus === 'lateJoiner' ? 'active' : lifecycleStatus,
    cohortId,
    joinedOnDay,
  };
  state.scenario.playerMeta.set(basePlayer.id, meta);
  state.runtime.set(basePlayer.id, createRuntime(meta, state.rng));
  state.scenario.events.push({
    kind: 'lateJoin',
    day: state.base.day + 1,
    actorId: basePlayer.id,
  });
}

function prepareActivity(state: EraSimulationRunState, day: number): void {
  for (const player of Array.from(state.base.players.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const meta = state.scenario.playerMeta.get(player.id);
    const runtime = state.runtime.get(player.id);
    if (!meta || !runtime) continue;

    let nextMeta = meta;
    if (meta.lifecycleStatus === 'inactive') {
      const reactivation = evaluateReactivation({
        state: runtime.inactivity,
        roll: state.rng.next(),
      });
      runtime.inactivity = reactivation.state;
      if (reactivation.reactivated) {
        nextMeta = { ...meta, lifecycleStatus: 'active' };
        state.scenario.events.push({
          kind: 'reactivation',
          day,
          actorId: player.id,
        });
        state.scenario.cumulative.totalReactivations += 1;
      }
    }

    if (nextMeta.lifecycleStatus === 'rebuilding') {
      player.status = 'inactive';
      state.scenario.playerMeta.set(player.id, nextMeta);
      continue;
    }

    const activity = evaluateDailyActivity({
      activityClass: nextMeta.activityClass,
      currentDay: day,
      schedule: runtime.activity,
      rng: state.rng,
    });
    runtime.activity = activity;
    player.status = activity.actsToday ? 'active' : 'inactive';

    if (player.status === 'active') {
      const probability = computeInactivityProbability({
        originalActivityClass: runtime.inactivity.originalActivityClass,
        wipedOnDay: runtime.wipeBaseline?.wipedOnDay ?? null,
        currentDay: day,
        lastMeaningfulActionDay:
          runtime.meaningfulActions.days[
            runtime.meaningfulActions.days.length - 1
          ] ?? null,
      });
      const inactivity = evaluateInactivity({
        state: runtime.inactivity,
        probability,
        roll: state.rng.next(),
      });
      runtime.inactivity = inactivity.state;
      if (inactivity.becameInactive) {
        player.status = 'inactive';
        nextMeta = { ...nextMeta, lifecycleStatus: 'inactive' };
      }
    }
    state.scenario.playerMeta.set(player.id, nextMeta);
  }
}

function countIncomingAttacks(player: PlayerState): number {
  return Array.from(player.incomingAttackHistory.values()).reduce(
    (total, history) => total + history.length,
    0,
  );
}

function captureDayStart(state: EraSimulationRunState): void {
  for (const player of state.base.players.values()) {
    const runtime = state.runtime.get(player.id);
    if (!runtime) continue;
    runtime.dayStart = {
      workerCount: player.units.worker,
      fortHp: player.fortHp,
      incomingAttackCount: countIncomingAttacks(player),
    };
  }
}

function refreshThreatSignals(state: EraSimulationRunState, day: number): void {
  for (const player of Array.from(state.base.players.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const runtime = state.runtime.get(player.id);
    const start = runtime?.dayStart;
    if (!runtime || !start) continue;
    const incomingAttackCount = countIncomingAttacks(player);
    const sample: DailySignalSample = {
      day,
      income: calculateTurnIncome(player) * TICKS_PER_DAY,
      loot: 0,
      workersLost: Math.max(0, start.workerCount - player.units.worker),
      attacksSuffered: Math.max(
        0,
        incomingAttackCount - start.incomingAttackCount,
      ),
      breached: start.fortHp > 0 && player.fortHp <= 0,
      incomingAttackers: Math.max(
        0,
        incomingAttackCount - start.incomingAttackCount,
      ),
    };
    runtime.dailySamples = [...runtime.dailySamples, sample].slice(-7);
    const samples = runtime.dailySamples;
    const sum = (selector: (entry: DailySignalSample) => number): number =>
      samples.reduce((total, entry) => total + selector(entry), 0);
    const lastBreach = [...samples].reverse().find((entry) => entry.breached);
    const threatened =
      sample.breached || sample.workersLost > 0 || sample.attacksSuffered > 0;
    runtime.signals = {
      incomeLastDay: sample.income,
      income7d: sum((entry) => entry.income),
      lootGainedLastDay: sample.loot,
      loot7d: sum((entry) => entry.loot),
      workersLostLastDay: sample.workersLost,
      workersAssassinatedLastDay: 0,
      workersAssassinated7d: 0,
      attacksSufferedLastDay: sample.attacksSuffered,
      attacksSuffered7d: sum((entry) => entry.attacksSuffered),
      fortBreachedLast7d: samples.some((entry) => entry.breached),
      fortBreachDaysAgo: lastBreach ? day - lastBreach.day : null,
      incomingAttackersLast7d: sum((entry) => entry.incomingAttackers),
      daysSinceLastThreat: threatened
        ? 0
        : runtime.signals.daysSinceLastThreat + 1,
      allianceThreatLevel: 0,
    };
    runtime.dayStart = null;
  }
}

function applyPersonaPolicies(state: EraSimulationRunState, day: number): void {
  const population = Array.from(state.base.players.values());
  for (const player of population.sort((a, b) => a.id.localeCompare(b.id))) {
    if (player.status !== 'active') continue;
    const meta = state.scenario.playerMeta.get(player.id);
    const runtime = state.runtime.get(player.id);
    if (!meta || !runtime) continue;
    runtime.posture = chooseCombatPosture(player, meta.persona);
    const observation = buildPersonaObservation(
      player,
      population,
      meta.persona,
      meta.farmerVariant,
      meta.activityClass,
      {
        day,
        tick: 0,
        ticksPerDay: TICKS_PER_DAY,
        attackLevelRange: state.config.attackLevelRange ?? 5,
        currentDay: day,
        expectedRemainingTicks: Math.max(
          0,
          (state.base.totalDays - day + 1) * TICKS_PER_DAY,
        ),
        signals: runtime.signals,
        coverageFraction: calculateItemCoverage(player),
      },
    );
    const policy = decidePersonaPolicy(
      observation,
      runtime.tactical,
      state.rng,
    );
    runtime.tactical = policy.nextTactical;
    const adapter = personaDecisionToAgentDecision(policy.decision, player);
    // Route recruitment / upgrades / fort repair through the costed
    // `applyDecision` path so gold is deducted via `calculateTotalUnitCost`
    // before any unit counters move. The previous inline mutation handed
    // out trained units for free, silently inflating military strength.
    const beforeGold = player.gold;
    const updated = applyDecision(player, adapter.agent, {
      day,
      playerId: player.id,
    });
    Object.assign(player, updated);
    purchaseItemStockpile(player, runtime.posture);
    const goldSpent = beforeGold - player.gold;
    if (goldSpent > 0) {
      runtime.meaningfulActions = recordMeaningfulAction({
        log: runtime.meaningfulActions,
        kind: 'training',
        day,
        resourceDelta: goldSpent,
      });
    }
  }
}

function updateLifecycle(state: EraSimulationRunState, day: number): void {
  const ruleset = getRuleset(
    state.config.rulesetId ?? state.scenario.manifest.rulesetId,
  );
  const players = Array.from(state.base.players.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const player of players) {
    const meta = state.scenario.playerMeta.get(player.id);
    const runtime = state.runtime.get(player.id);
    if (!meta || !runtime) continue;
    const power = getPlayerPower(player);
    runtime.powerHistory = recordStrategicPowerSample({
      history: runtime.powerHistory,
      day,
      power,
    });
    const peak = computeTrailingPeak(runtime.powerHistory, day);

    if (
      meta.lifecycleStatus !== 'rebuilding' &&
      peak != null &&
      shouldWipe({
        fortHp: player.fortHp,
        strategicPower: power,
        frozenPreLossPeak: peak,
      })
    ) {
      const entry = enterRebuilding({
        playerId: player.id,
        wipedOnDay: day,
        frozenPreLossPeak: peak,
        ruleset,
      });
      runtime.wipeBaseline = entry.wipeBaseline;
      runtime.recovery = entry.recovery;
      state.scenario.playerMeta.set(player.id, {
        ...meta,
        lifecycleStatus: 'rebuilding',
        activityClass: 'rebuilding',
      });
      player.status = 'inactive';
      state.scenario.events.push(entry.event);
      state.scenario.cumulative.totalWipes += 1;
      if (entry.shield)
        state.scenario.rebuildShields.set(player.id, entry.shield);
      continue;
    }

    if (meta.lifecycleStatus === 'rebuilding' && runtime.wipeBaseline) {
      const recovery = updateRecoveryTracker({
        tracker: runtime.recovery,
        currentDay: day,
        currentStrategicPower: power,
        wipeBaseline: runtime.wipeBaseline,
      });
      runtime.recovery = recovery.tracker;
      for (const milestone of recovery.milestonesSustained) {
        state.scenario.events.push({
          kind: 'recovery',
          day,
          actorId: player.id,
          value: milestone,
        });
      }
      const shield = state.scenario.rebuildShields.get(player.id);
      if (shield && !shield.expired && ruleset.rebuildShield) {
        const policy = ruleset.rebuildShield;
        // Outgoing PvP lifts the shield when the policy allows it.
        // `dailyLimits.attacksUsed` is reset by `processDailyReset` at
        // the start of each day, so a positive value reflects today's
        // outgoing attacks by the rebuilding player.
        let nextShield = shield;
        if (policy.pvpActionLiftsShield && player.dailyLimits.attacksUsed > 0) {
          nextShield = advanceRebuildShield(policy, nextShield, {
            kind: 'outgoingPvp',
            currentDay: day,
          });
        }
        // 50% power-recovery early expiry.
        if (!nextShield.expired) {
          nextShield = advanceRebuildShield(policy, nextShield, {
            kind: 'powerSampled',
            currentDay: day,
            currentStrategicPower: power,
          });
        }
        // Duration exhaustion (final fall-through path so every active
        // shield reaches `expired=true` once `durationDays` elapses).
        if (!nextShield.expired) {
          nextShield = advanceRebuildShield(policy, nextShield, {
            kind: 'dayElapsed',
            currentDay: day,
          });
        }
        state.scenario.rebuildShields.set(player.id, nextShield);
      }
    }

    runtime.adaptation = recordAdaptationOutcome({
      state: runtime.adaptation,
      day,
      value: player.defensePressureToday - player.spyPressureToday,
    });
    if (shouldAdapt({ state: runtime.adaptation, currentDay: day })) {
      runtime.adaptation = adaptTactics({
        state: runtime.adaptation,
        currentDay: day,
        persona: meta.persona,
      }).state;
      state.scenario.events.push({
        kind: 'adaptation',
        day,
        actorId: player.id,
      });
    }
  }
}

/** Creates an ERA run state without simulating a day. */
export async function createEraSimulation(
  options: RunEraSimulationOptions = {},
): Promise<EraSimulationRunState> {
  const days = options.days ?? options.manifest?.totalDays ?? 730;
  const seed = options.config?.seed ?? options.manifest?.seed ?? 42;
  const manifest = options.manifest ?? defaultManifest(days, seed);
  const players = [
    ...(options.players ?? createEraCohort(manifest.primaryCohort)),
  ];
  const config: EraSimulationConfig = {
    ...options.config,
    seed,
    rulesetId: options.config?.rulesetId ?? manifest.rulesetId,
  };
  const base = await runSimulation(players, 0, config);
  base.totalDays = days;

  const playerMeta = new Map<string, EraPlayerScenarioState>();
  const runtime = new Map<string, PlayerEraRuntime>();
  const rng = createRng(seed);
  for (const player of players) {
    const meta: EraPlayerScenarioState = {
      persona: player.persona,
      farmerVariant: player.farmerVariant,
      activityClass: player.activityClass,
      lifecycleStatus: player.lifecycleStatus,
      cohortId: player.cohortId,
      joinedOnDay: player.joinedOnDay,
    };
    playerMeta.set(player.id, meta);
    runtime.set(player.id, createRuntime(meta, rng));
  }
  const allianceMeta = buildAllianceManifests(
    manifest.allianceMode,
    Array.from(base.players.values()),
  );
  const scenario: EraScenarioState = {
    manifest,
    playerMeta,
    allianceMeta,
    checkpoints: [],
    events: [],
    cumulative: createEmptyCumulativeCounters(),
    dailyCasualtyCapUsage: new Map(),
    rebuildShields: new Map(),
  };
  const lateJoiners = new Map<number, EraPlayerState[]>();
  for (const player of options.lateJoiners ?? []) {
    const wave = lateJoiners.get(player.joinedOnDay) ?? [];
    wave.push(player);
    lateJoiners.set(player.joinedOnDay, wave);
  }
  const state: EraSimulationRunState = {
    base,
    scenario,
    config,
    runtime,
    rng,
    alliances: createAllianceStates(allianceMeta),
    lateJoiners,
    checkpointMetrics: [],
  };
  state.scenario.checkpoints.push(snapshotCheckpoint(state));
  state.checkpointMetrics.push(...collectCohortMetrics(state, 0));
  return state;
}

/**
 * Nominate a single focus-fire target per `focusFive` alliance on the first
 * day the alliance sees an eligible non-member, then record the coordinated
 * attack plan via `planCoordinatedAttack`. Both helpers are pure with
 * respect to attacker/target state; the plan is appended to
 * `alliance.attackPlans` and a `focusFireNomination` scenario event is
 * emitted so the daily run is observable.
 */
function runAllianceFocusFire(state: EraSimulationRunState, day: number): void {
  for (const alliance of state.alliances.values()) {
    if (alliance.mode !== 'focusFive') continue;
    // Nominate at most one target per run; subsequent days reuse it.
    if (alliance.nominations.length > 0) continue;
    const { memberIds } = alliance;
    const candidates = Array.from(state.base.players.values())
      .filter((p) => p.status === 'active' && !memberIds.has(p.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 0) continue;
    const target = candidates[0];
    if (!target) continue;
    const nomination = nominateFocusTarget(alliance, target.id, undefined, day);
    state.scenario.events.push({
      kind: 'focusFireNomination',
      day,
      actorId: alliance.leaderId,
      targetId: target.id,
      allianceId: alliance.allianceId,
    });
    const currentTick = (day - 1) * TICKS_PER_DAY;
    planCoordinatedAttack(alliance, nomination, {
      players: state.base.players,
      currentTick,
      windowTicks: TICKS_PER_DAY,
      currentDay: day,
    });
  }
}

/**
 * Authorizes at most one treasury aid per alliance per day. The leader
 * transfers funds to the active member with the lowest hand gold, subject
 * to the alliance-bank conservation caps enforced by
 * `authorizeTreasuryAid`. Records an `allianceAid` scenario event on
 * success.
 */
function runAllianceAid(state: EraSimulationRunState, day: number): void {
  for (const alliance of state.alliances.values()) {
    if (alliance.treasury <= 0) continue;
    const leader = state.base.players.get(alliance.leaderId);
    if (!leader || leader.status !== 'active') continue;
    const members = Array.from(alliance.memberIds)
      .map((id) => state.base.players.get(id))
      .filter((p): p is PlayerState => p != null && p.status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id));
    if (members.length === 0) continue;
    const recipient = members.reduce((lowest, current) =>
      current.gold < lowest.gold ? current : lowest,
    );
    if (!recipient || recipient.gold >= 100_000) continue;
    const trailing7dIncome = estimateTrailing7dIncome(recipient);
    const requested = Math.floor(
      alliance.treasury * ALLIANCE_AID_TREASURY_FRACTION,
    );
    const record = authorizeTreasuryAid(
      alliance,
      leader,
      recipient,
      requested,
      day,
      trailing7dIncome,
    );
    if (record) {
      state.scenario.events.push({
        kind: 'allianceAid',
        day,
        actorId: leader.id,
        targetId: recipient.id,
        allianceId: alliance.allianceId,
        value: record.amount,
      });
      state.scenario.cumulative.totalAllianceAid += record.amount;
    }
  }
}

/**
 * Propagates each member's fresh intel to the rest of its alliance via
 * `shareFreshIntel`. Stale intel is filtered by `isIntelFresh` inside the
 * helper; targets are iterated in stable id order so identical inputs
 * always produce identical recipient writes.
 */
function runAllianceIntelShare(
  state: EraSimulationRunState,
  day: number,
): void {
  for (const alliance of state.alliances.values()) {
    const members = Array.from(alliance.memberIds)
      .map((id) => state.base.players.get(id))
      .filter((p): p is PlayerState => p != null && p.status === 'active');
    if (members.length <= 1) continue;
    const recipients = new Map<string, PlayerState>();
    for (const m of members) recipients.set(m.id, m);
    for (const member of members) {
      const targetIds = Array.from(member.intelCache.keys()).sort();
      for (const targetId of targetIds) {
        const intel = member.intelCache.get(targetId);
        if (!intel || !isIntelFresh(intel, day)) continue;
        shareFreshIntel(alliance, member.id, targetId, intel, day, recipients);
      }
    }
  }
}

/**
 * Exercises the `spyBehavior` pipeline (plan -> execute -> apply) for each
 * active `spy` or `balanced` persona player. The pipeline respects the
 * per-day mission caps via `dailyLimitsToTracker` and writes results back
 * through `planSpyApplication` so casualties, intel, turns, stamina, and
 * dailyLimits all flow through the single tested contract.
 *
 * Other personas keep using the legacy day-cycle intel path (already
 * exercised inside `simulateDay`), so this integration stays minimal and
 * targets the personas whose production behavior is spy-heavy.
 */
async function runDailySpyMissions(
  state: EraSimulationRunState,
  day: number,
): Promise<void> {
  const population = Array.from(state.base.players.values());
  const sorted = population.sort((a, b) => a.id.localeCompare(b.id));
  const attackLevelRange =
    state.config.attackLevelRange ?? DEFAULT_ATTACK_LEVEL_RANGE;
  for (const attacker of sorted) {
    if (attacker.status !== 'active') continue;
    const meta = state.scenario.playerMeta.get(attacker.id);
    if (!meta) continue;
    if (meta.persona !== 'spy' && meta.persona !== 'balanced') continue;
    const candidates = population.filter((p) => p.id !== attacker.id);
    if (candidates.length === 0) continue;
    const limits = playerStateToSpyLimits(attacker);
    const tracker = dailyLimitsToTracker(attacker);
    const { decisions } = planSpyMissions({
      attacker,
      candidates,
      persona: meta.persona,
      tracker,
      limits,
      attackLevelRange,
      rng: state.rng,
      maxMissionsPerInvocation: 1,
      day,
    });
    const runtime = state.runtime.get(attacker.id);
    for (const decision of decisions) {
      const target = state.base.players.get(decision.targetId);
      if (!target || target.status !== 'active') continue;
      const execution = await executeSpyMission({
        attacker,
        defender: target,
        decision,
        // Wrap in an arrow function so the call site is safe regardless
        // of whether `Rng.next` is implemented as a closure or a method
        // that relies on `this`. The current `createRng` uses a closure,
        // but the wrapper keeps the contract defensive.
        random: () => state.rng.next(),
        day,
        audience: { kind: 'self' },
      });
      const plan = planSpyApplication(execution, decision, attacker);
      attacker.attackTurns = Math.max(
        0,
        attacker.attackTurns + plan.attackerTurnsDelta,
      );
      attacker.stamina = Math.max(
        0,
        attacker.stamina + plan.attackerStaminaDelta,
      );
      for (const key of Object.keys(plan.attackerCasualtyDeltas) as Array<
        keyof UnitCounts
      >) {
        const delta = plan.attackerCasualtyDeltas[key] ?? 0;
        attacker.units[key] = Math.max(0, attacker.units[key] + delta);
      }
      target.spyPressureToday += plan.defenderSpyPressureDelta;
      for (const key of Object.keys(plan.defenderCasualtyDeltas) as Array<
        keyof UnitCounts
      >) {
        const delta = plan.defenderCasualtyDeltas[key] ?? 0;
        target.units[key] = Math.max(0, target.units[key] + delta);
      }
      target.fortHp = Math.max(0, target.fortHp - plan.defenderFortDamage);
      attacker.dailyLimits.intelUsed = plan.dailyLimitsDelta.intelUsed;
      attacker.dailyLimits.assassinationUsed =
        plan.dailyLimitsDelta.assassinationUsed;
      attacker.dailyLimits.infiltrationUsed =
        plan.dailyLimitsDelta.infiltrationUsed;
      if (plan.intelRecord) {
        attacker.intelCache.set(plan.intelRecord.targetId, {
          ...plan.intelRecord.result,
          day,
        });
      }
      if (runtime) {
        runtime.meaningfulActions = recordMeaningfulAction({
          log: runtime.meaningfulActions,
          kind: 'spy',
          day,
          resourceDelta: decision.spies,
        });
      }
    }
  }
}

/** Runs one explicit ERA day without changing the legacy `simulateDay` API. */
export async function simulateEraDay(
  state: EraSimulationRunState,
): Promise<void> {
  const day = state.base.day + 1;
  for (const joiner of state.lateJoiners.get(day) ?? [])
    addLateJoiner(state, joiner);
  state.scenario.dailyCasualtyCapUsage.clear();
  for (const player of state.base.players.values()) {
    state.scenario.dailyCasualtyCapUsage.set(player.id, {
      casualtiesApplied: 0,
      startOfDayPopulation: Object.values(player.units).reduce(
        (sum, count) => sum + count,
        0,
      ),
    });
  }
  captureDayStart(state);
  prepareActivity(state, day);
  applyPersonaPolicies(state, day);

  const activePlayers = Array.from(state.base.players.values()).filter(
    (player) => player.status === 'active',
  );
  const recruitment = generateRecruitmentEvents(
    state.scenario.manifest.recruitment,
    activePlayers,
    day,
    state.rng,
  );
  state.scenario.cumulative.totalRewardEvents += recruitment.events.reduce(
    (sum, event) => sum + event.citizensAwarded,
    0,
  );
  state.scenario.cumulative.totalRewardCitizens += recruitment.totalCitizens;
  state.scenario.cumulative.totalRewardGold += recruitment.totalGold;
  for (const event of recruitment.events)
    state.scenario.events.push({
      kind: 'recruitmentAward',
      day,
      actorId: event.recipientId,
      value: event.goldAwarded,
    });

  for (const alliance of state.alliances.values()) {
    for (const memberId of alliance.memberIds) {
      const member = state.base.players.get(memberId);
      if (member && member.status === 'active' && member.gold >= 100_000) {
        depositToTreasury(
          alliance,
          member,
          Math.floor(member.gold * 0.01),
          day,
        );
      }
    }
  }

  // Alliance focus-fire nomination must happen before combat so the
  // resulting plan is recorded for the same day's attacks.
  runAllianceFocusFire(state, day);

  await simulateDay(state.base, {
    rulesetId: state.config.rulesetId ?? state.scenario.manifest.rulesetId,
    dailyCasualtyCapUsage: state.scenario.dailyCasualtyCapUsage,
    rebuildShields: state.scenario.rebuildShields,
    personaManagedEconomy: true,
  });
  appendBaseMetrics(state.base);
  refreshThreatSignals(state, day);
  // Spy missions via the spyBehavior pipeline run after the legacy day
  // cycle so their results land in the intel cache for the next day's
  // persona policies; alliance aid and intel sharing reuse the same
  // post-combat view of member gold and intel.
  await runDailySpyMissions(state, day);
  runAllianceAid(state, day);
  runAllianceIntelShare(state, day);
  updateLifecycle(state, day);
  if (ERA_CHECKPOINT_DAYS.has(day)) {
    state.scenario.checkpoints.push(snapshotCheckpoint(state));
    state.checkpointMetrics.push(...collectCohortMetrics(state, day));
  }
}

/** Runs an ERA scenario for the requested number of deterministic days. */
export async function runEraSimulation(
  options: RunEraSimulationOptions = {},
): Promise<EraSimulationRunState> {
  const state = await createEraSimulation(options);
  for (let day = 0; day < state.base.totalDays; day += 1)
    await simulateEraDay(state);
  return state;
}

/** Convenience factory for standard fresh late joiners. */
export function createStandardLateJoiners(): EraPlayerState[] {
  return [30, 90, 180, 365].map((day) => createLateJoiner(day, 'balanced'));
}
