/**
 * Deterministic ERA lifecycle transitions for `src/sim`.
 *
 * Pure, composable helpers covering plan Todo 6 (`.omo/plans/era-730-day-behavior-simulation.md`
 * lines 122-128): activity scheduling, inactivity/reactivation, wipe/rebuild/recovery,
 * and intra-run adaptation. Every transition takes explicit state plus an
 * injected `Rng` and returns the next state. Invalid numeric/config state
 * throws via `./invariants` rather than being silently clamped.
 */

import { SimulationConfigError, SimulationInvariantError } from './invariants';
import type { Rng } from './random';
import { validateRandomDraw } from './random';
import {
  advanceRebuildShield,
  createRebuildShield,
  type RebuildShieldEvent,
  type RebuildShieldPolicy,
  type RebuildShieldState,
  type RulesetManifest,
} from './rulesets';
import type {
  ActivityClass,
  LifecycleStatus,
  Persona,
  ScenarioEvent,
} from './scenarioTypes';
import { ScenarioEventKind } from './scenarioTypes';

// ============================================================
// Constants — spec-pinned, exposed for tests and reporting.
// ============================================================

export const ACTIVE_DAILY_ACTION_PROBABILITY = 0.9;
export const PASSIVE_NEXT_ACTION_MIN_DELAY_DAYS = 1;
export const PASSIVE_NEXT_ACTION_MAX_DELAY_DAYS = 3;

export const INACTIVITY_BASE_PROBABILITY_ACTIVE = 0.001; // 0.1%
export const INACTIVITY_BASE_PROBABILITY_PASSIVE = 0.003; // 0.3%
export const POST_WIPE_INACTIVITY_BOOST = 0.05; // +5 percentage points
export const POST_WIPE_BOOST_WINDOW_DAYS = 7;
export const MEANINGFUL_ACTION_DROUGHT_THRESHOLD_DAYS = 7;
export const MEANINGFUL_ACTION_DROUGHT_BOOST = 0.01; // +1 percentage point

export const REACTIVATION_PROBABILITY_ACTIVE = 0.1; // 10%
export const REACTIVATION_PROBABILITY_PASSIVE = 0.05; // 5%

export const STRATEGIC_POWER_TRAILING_WINDOW_DAYS = 7;
export const WIPE_POWER_FRACTION_THRESHOLD = 0.25;

export const RECOVERY_MILESTONES: readonly number[] = [0.25, 0.5, 0.9];
export const RECOVERY_SUSTAINED_DAYS_REQUIRED = 3;

export const ADAPTATION_INTERVAL_DAYS = 7;
export const ADAPTATION_ROLLING_OUTCOME_WINDOW = 14;
export const ADAPTATION_TACTICS_STEP = 0.05;
export const ADAPTATION_TACTICS_MAX_DELTA = 0.2;
export const ADAPTATION_OUTCOME_THRESHOLD = 2;

// ============================================================
// Activity scheduling
// ============================================================

export interface ActivitySchedule {
  readonly lastEvaluatedDay: number;
  readonly nextActionDay: number;
  readonly actsToday: boolean;
}

/**
 * Active users roll a 90% action opportunity for the join day. Passive
 * users defer their first action 1-3 days ahead using the seeded RNG.
 */
export function createInitialActivitySchedule(input: {
  readonly activityClass: ActivityClass;
  readonly joinedOnDay: number;
  readonly rng: Rng;
}): ActivitySchedule {
  if (!Number.isInteger(input.joinedOnDay) || input.joinedOnDay < 0) {
    throw new SimulationConfigError(
      `createInitialActivitySchedule joinedOnDay must be a non-negative integer; received ${input.joinedOnDay}`,
      'lifecycle-schedule-invalid-day',
    );
  }
  if (input.activityClass === 'active') {
    return {
      lastEvaluatedDay: input.joinedOnDay,
      nextActionDay: input.joinedOnDay,
      actsToday: rollActiveDailyAction(input.rng.next()),
    };
  }
  const delay = rollPassiveNextActionDelay(input.rng);
  return {
    lastEvaluatedDay: input.joinedOnDay,
    nextActionDay: input.joinedOnDay + delay,
    actsToday: false,
  };
}

/**
 * Pure roll helper for the 90% active daily action opportunity.
 * Boundary semantics: `roll < probability` (a draw exactly equal to the
 * probability does not trigger).
 */
export function rollActiveDailyAction(roll: number): boolean {
  return validateRandomDraw(roll) < ACTIVE_DAILY_ACTION_PROBABILITY;
}

export function rollPassiveNextActionDelay(rng: Rng): number {
  return rng.int(
    PASSIVE_NEXT_ACTION_MIN_DELAY_DAYS,
    PASSIVE_NEXT_ACTION_MAX_DELAY_DAYS,
  );
}

/**
 * Advances the schedule by one day. Active users re-roll the 90%
 * opportunity. Passive users act only on their scheduled day and then
 * reschedule 1-3 days ahead. Inactive and rebuilding users never act.
 */
export function evaluateDailyActivity(input: {
  readonly activityClass: ActivityClass;
  readonly currentDay: number;
  readonly schedule: ActivitySchedule;
  readonly rng: Rng;
}): ActivitySchedule {
  if (!Number.isInteger(input.currentDay) || input.currentDay < 0) {
    throw new SimulationConfigError(
      `evaluateDailyActivity currentDay must be a non-negative integer; received ${input.currentDay}`,
      'lifecycle-schedule-invalid-day',
    );
  }
  if (input.currentDay < input.schedule.lastEvaluatedDay) {
    throw new SimulationConfigError(
      `evaluateDailyActivity currentDay (${input.currentDay}) cannot move backwards relative to lastEvaluatedDay (${input.schedule.lastEvaluatedDay})`,
      'lifecycle-schedule-backwards',
    );
  }

  if (
    input.activityClass === 'inactive' ||
    input.activityClass === 'rebuilding'
  ) {
    return {
      lastEvaluatedDay: input.currentDay,
      nextActionDay: input.schedule.nextActionDay,
      actsToday: false,
    };
  }

  if (input.activityClass === 'active') {
    return {
      lastEvaluatedDay: input.currentDay,
      nextActionDay: input.currentDay,
      actsToday: rollActiveDailyAction(input.rng.next()),
    };
  }

  if (input.currentDay >= input.schedule.nextActionDay) {
    const delay = rollPassiveNextActionDelay(input.rng);
    return {
      lastEvaluatedDay: input.currentDay,
      nextActionDay: input.currentDay + delay,
      actsToday: true,
    };
  }
  return {
    lastEvaluatedDay: input.currentDay,
    nextActionDay: input.schedule.nextActionDay,
    actsToday: false,
  };
}

// ============================================================
// Inactivity / reactivation
// ============================================================

export type OriginalActivityClass = 'active' | 'passive';

export interface InactivityState {
  readonly inactiveSinceDay: number | null;
  readonly originalActivityClass: OriginalActivityClass;
}

export function createInitialInactivityState(
  originalActivityClass: OriginalActivityClass,
): InactivityState {
  return { inactiveSinceDay: null, originalActivityClass };
}

/**
 * Class base + additive percentage-point boosts:
 *   - +5 pp for the 7-day window after a wipe
 *   - +1 pp once a 7-day meaningful-action drought begins
 */
export function computeInactivityProbability(input: {
  readonly originalActivityClass: OriginalActivityClass;
  readonly wipedOnDay: number | null;
  readonly currentDay: number;
  readonly lastMeaningfulActionDay: number | null;
}): number {
  if (!Number.isInteger(input.currentDay) || input.currentDay < 0) {
    throw new SimulationConfigError(
      `computeInactivityProbability currentDay must be a non-negative integer; received ${input.currentDay}`,
      'lifecycle-inactivity-invalid-day',
    );
  }

  const base =
    input.originalActivityClass === 'active'
      ? INACTIVITY_BASE_PROBABILITY_ACTIVE
      : INACTIVITY_BASE_PROBABILITY_PASSIVE;

  let boost = 0;
  if (
    input.wipedOnDay != null &&
    Number.isInteger(input.wipedOnDay) &&
    input.wipedOnDay >= 0 &&
    input.currentDay >= input.wipedOnDay &&
    input.currentDay - input.wipedOnDay < POST_WIPE_BOOST_WINDOW_DAYS
  ) {
    boost += POST_WIPE_INACTIVITY_BOOST;
  }

  const droughtDays =
    input.lastMeaningfulActionDay == null
      ? input.currentDay
      : Number.isInteger(input.lastMeaningfulActionDay) &&
          input.lastMeaningfulActionDay >= 0
        ? input.currentDay - input.lastMeaningfulActionDay
        : input.currentDay;

  if (droughtDays >= MEANINGFUL_ACTION_DROUGHT_THRESHOLD_DAYS) {
    boost += MEANINGFUL_ACTION_DROUGHT_BOOST;
  }

  return Math.min(1, Math.max(0, base + boost));
}

export function rollInactivity(roll: number, probability: number): boolean {
  const safeRoll = validateRandomDraw(roll);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new SimulationConfigError(
      `rollInactivity probability must be a finite number in [0, 1]; received ${probability}`,
      'lifecycle-inactivity-invalid-probability',
    );
  }
  return safeRoll < probability;
}

export function evaluateInactivity(input: {
  readonly state: InactivityState;
  readonly probability: number;
  readonly roll: number;
}): { readonly state: InactivityState; readonly becameInactive: boolean } {
  if (input.state.inactiveSinceDay != null) {
    return { state: input.state, becameInactive: false };
  }
  if (rollInactivity(input.roll, input.probability)) {
    return {
      state: { ...input.state, inactiveSinceDay: 0 },
      becameInactive: true,
    };
  }
  return { state: input.state, becameInactive: false };
}

export function getReactivationProbability(
  originalActivityClass: OriginalActivityClass,
): number {
  return originalActivityClass === 'active'
    ? REACTIVATION_PROBABILITY_ACTIVE
    : REACTIVATION_PROBABILITY_PASSIVE;
}

export function rollReactivation(
  roll: number,
  originalActivityClass: OriginalActivityClass,
): boolean {
  const safeRoll = validateRandomDraw(roll);
  return safeRoll < getReactivationProbability(originalActivityClass);
}

export function evaluateReactivation(input: {
  readonly state: InactivityState;
  readonly roll: number;
}): { readonly state: InactivityState; readonly reactivated: boolean } {
  if (input.state.inactiveSinceDay == null) {
    return { state: input.state, reactivated: false };
  }
  if (rollReactivation(input.roll, input.state.originalActivityClass)) {
    return {
      state: { ...input.state, inactiveSinceDay: null },
      reactivated: true,
    };
  }
  return { state: input.state, reactivated: false };
}

// ============================================================
// Meaningful-action classifier
// ============================================================

export type MeaningfulActionKind =
  | 'training'
  | 'purchase'
  | 'repair'
  | 'bank'
  | 'recruitment'
  | 'spy'
  | 'pvp';

export const MEANINGFUL_ACTION_KINDS: readonly MeaningfulActionKind[] = [
  'training',
  'purchase',
  'repair',
  'bank',
  'recruitment',
  'spy',
  'pvp',
] as const;

export interface MeaningfulActionLog {
  readonly days: readonly number[];
}

export function createInitialMeaningfulActionLog(): MeaningfulActionLog {
  return { days: [] };
}

/**
 * An action is meaningful when its kind is one of the qualifying kinds
 * AND its resource delta is strictly positive (consumes or moves a
 * positive resource). Zero-delta or negative-delta attempts never count.
 */
export function isMeaningfulAction(input: {
  readonly kind: MeaningfulActionKind;
  readonly resourceDelta: number;
}): boolean {
  if (!MEANINGFUL_ACTION_KINDS.includes(input.kind)) return false;
  if (!Number.isFinite(input.resourceDelta)) {
    throw new SimulationInvariantError({
      day: 0,
      playerId: '',
      field: 'resourceDelta',
      value: input.resourceDelta,
      reason: 'not-finite',
    });
  }
  return input.resourceDelta > 0;
}

/**
 * Appends the supplied day to the log when the action is meaningful.
 * Same-day duplicates and out-of-order days are ignored so the log stays
 * monotonic and de-duplicated.
 */
export function recordMeaningfulAction(input: {
  readonly log: MeaningfulActionLog;
  readonly kind: MeaningfulActionKind;
  readonly day: number;
  readonly resourceDelta: number;
}): MeaningfulActionLog {
  if (!Number.isInteger(input.day) || input.day < 0) {
    throw new SimulationConfigError(
      `recordMeaningfulAction day must be a non-negative integer; received ${input.day}`,
      'lifecycle-meaningful-action-invalid-day',
    );
  }
  if (!isMeaningfulAction(input)) return input.log;
  const last = input.log.days[input.log.days.length - 1];
  if (last === input.day) return input.log;
  if (last != null && last > input.day) return input.log;
  return { days: [...input.log.days, input.day] };
}

export function daysSinceLastMeaningfulAction(
  log: MeaningfulActionLog,
  currentDay: number,
): number | null {
  if (!Number.isInteger(currentDay) || currentDay < 0) {
    throw new SimulationConfigError(
      `daysSinceLastMeaningfulAction currentDay must be a non-negative integer; received ${currentDay}`,
      'lifecycle-meaningful-action-invalid-day',
    );
  }
  if (log.days.length === 0) return null;
  const last = log.days[log.days.length - 1];
  return Math.max(0, currentDay - last);
}

// ============================================================
// Strategic-power peak tracking
// ============================================================

export interface StrategicPowerHistory {
  readonly samples: ReadonlyArray<{
    readonly day: number;
    readonly power: number;
  }>;
}

export function createInitialStrategicPowerHistory(): StrategicPowerHistory {
  return { samples: [] };
}

export function recordStrategicPowerSample(input: {
  readonly history: StrategicPowerHistory;
  readonly day: number;
  readonly power: number;
}): StrategicPowerHistory {
  if (!Number.isInteger(input.day) || input.day < 0) {
    throw new SimulationConfigError(
      `recordStrategicPowerSample day must be a non-negative integer; received ${input.day}`,
      'lifecycle-strategic-power-invalid-day',
    );
  }
  if (!Number.isFinite(input.power) || input.power < 0) {
    throw new SimulationInvariantError({
      day: input.day,
      playerId: '',
      field: 'strategicPower',
      value: input.power,
      reason: input.power < 0 ? 'negative' : 'not-finite',
    });
  }
  const last = input.history.samples[input.history.samples.length - 1];
  if (last && input.day < last.day) {
    throw new SimulationConfigError(
      `recordStrategicPowerSample day (${input.day}) cannot move backwards relative to last sample (${last.day})`,
      'lifecycle-strategic-power-backwards',
    );
  }
  const samples = [
    ...input.history.samples,
    { day: input.day, power: input.power },
  ].slice(-STRATEGIC_POWER_TRAILING_WINDOW_DAYS);
  return { samples };
}

/**
 * Returns the max power observed in the trailing 7-day window ending at
 * `currentDay`, or null when no samples fall inside the window.
 */
export function computeTrailingPeak(
  history: StrategicPowerHistory,
  currentDay: number,
): number | null {
  if (!Number.isInteger(currentDay) || currentDay < 0) {
    throw new SimulationConfigError(
      `computeTrailingPeak currentDay must be a non-negative integer; received ${currentDay}`,
      'lifecycle-strategic-power-invalid-day',
    );
  }
  if (history.samples.length === 0) return null;
  const cutoff = currentDay - STRATEGIC_POWER_TRAILING_WINDOW_DAYS;
  let peak: number | null = null;
  for (const sample of history.samples) {
    if (sample.day <= cutoff) continue;
    if (peak == null || sample.power > peak) peak = sample.power;
  }
  return peak;
}

// ============================================================
// Wipe detection
// ============================================================

export interface WipeBaseline {
  readonly frozenPreLossPeak: number;
  readonly wipedOnDay: number;
}

/**
 * Wipe requires BOTH:
 *   1. fortHp <= 0
 *   2. strategicPower < 25% of frozenPreLossPeak
 *
 * A null or non-positive peak means no pre-loss baseline has been
 * established, so wipe is impossible — this is the explicit "pre-loss
 * Farmer false wipe" guard.
 */
export function shouldWipe(input: {
  readonly fortHp: number;
  readonly strategicPower: number;
  readonly frozenPreLossPeak: number | null;
}): boolean {
  if (!Number.isFinite(input.fortHp)) {
    throw new SimulationInvariantError({
      day: 0,
      playerId: '',
      field: 'fortHp',
      value: input.fortHp,
      reason: 'not-finite',
    });
  }
  if (!Number.isFinite(input.strategicPower)) {
    throw new SimulationInvariantError({
      day: 0,
      playerId: '',
      field: 'strategicPower',
      value: input.strategicPower,
      reason: 'not-finite',
    });
  }
  if (input.fortHp > 0) return false;
  if (input.frozenPreLossPeak == null) return false;
  if (input.frozenPreLossPeak <= 0) return false;
  return (
    input.strategicPower <
    input.frozenPreLossPeak * WIPE_POWER_FRACTION_THRESHOLD
  );
}

/**
 * Diagnostic helper: returns true when the supplied Farmer candidate
 * must NOT be wiped because no peak has been established yet (pre-loss
 * state). Farmers are the canonical false-positive risk because their
 * baseline military is naturally low.
 */
export function isPreLossFarmerFalseWipeCandidate(input: {
  readonly persona: Persona;
  readonly frozenPreLossPeak: number | null;
}): boolean {
  if (input.persona !== 'farmer') return false;
  return input.frozenPreLossPeak == null || input.frozenPreLossPeak <= 0;
}

// ============================================================
// Wipe / rebuild entry
// ============================================================

export interface RebuildingEntry {
  readonly wipeBaseline: WipeBaseline;
  readonly recovery: RecoveryTracker;
  readonly shield: RebuildShieldState | null;
  readonly lifecycleStatus: LifecycleStatus;
  readonly event: ScenarioEvent;
}

/**
 * Freezes the pre-loss peak as the recovery baseline, marks the lifecycle
 * status as `rebuilding`, and (when the ruleset supplies a shield policy)
 * activates the candidate rebuild shield via `./rulesets.createRebuildShield`.
 */
export function enterRebuilding(input: {
  readonly playerId: string;
  readonly wipedOnDay: number;
  readonly frozenPreLossPeak: number;
  readonly ruleset: RulesetManifest;
}): RebuildingEntry {
  if (!Number.isInteger(input.wipedOnDay) || input.wipedOnDay < 0) {
    throw new SimulationConfigError(
      `enterRebuilding wipedOnDay must be a non-negative integer; received ${input.wipedOnDay}`,
      'lifecycle-rebuild-invalid-day',
    );
  }
  if (
    !Number.isFinite(input.frozenPreLossPeak) ||
    input.frozenPreLossPeak <= 0
  ) {
    throw new SimulationConfigError(
      `enterRebuilding frozenPreLossPeak must be a positive finite number; received ${input.frozenPreLossPeak}`,
      'lifecycle-rebuild-invalid-peak',
    );
  }

  const wipeBaseline: WipeBaseline = {
    frozenPreLossPeak: input.frozenPreLossPeak,
    wipedOnDay: input.wipedOnDay,
  };
  const event: ScenarioEvent = {
    kind: ScenarioEventKind.Wipe,
    day: input.wipedOnDay,
    actorId: input.playerId,
    reason: input.ruleset.rebuildShield ? 'wipe-shielded' : 'wipe-unshielded',
    value: input.frozenPreLossPeak,
  };
  const shield = input.ruleset.rebuildShield
    ? createRebuildShield({
        playerId: input.playerId,
        activatedOnDay: input.wipedOnDay,
        frozenPreWipeStrategicPower: input.frozenPreLossPeak,
        policy: input.ruleset.rebuildShield,
      })
    : null;

  return {
    wipeBaseline,
    recovery: createInitialRecoveryTracker(),
    shield,
    lifecycleStatus: 'rebuilding',
    event,
  };
}

// ============================================================
// Recovery tracking
// ============================================================

/**
 * Per-player recovery tracker. `firstSustainedCrossings` maps each
 * milestone fraction (0.25, 0.5, 0.9) to the first day it was held for
 * three consecutive days, or null when not yet reached. `sustainedCounters`
 * carries the live per-milestone streak so updates stay pure.
 */
export interface RecoveryTracker {
  readonly firstSustainedCrossings: Readonly<Record<number, number | null>>;
  readonly highestMilestoneReached: number;
  readonly sustainedDaysAtHighest: number;
  readonly relapsed: boolean;
  readonly sustainedCounters: Readonly<Record<number, number>>;
}

export function createInitialRecoveryTracker(): RecoveryTracker {
  const crossings: Record<number, number | null> = {};
  const counters: Record<number, number> = {};
  for (const milestone of RECOVERY_MILESTONES) {
    crossings[milestone] = null;
    counters[milestone] = 0;
  }
  return {
    firstSustainedCrossings: crossings,
    highestMilestoneReached: 0,
    sustainedDaysAtHighest: 0,
    relapsed: false,
    sustainedCounters: counters,
  };
}

export function computeRecoveryFraction(input: {
  readonly currentStrategicPower: number;
  readonly wipeBaseline: WipeBaseline | null;
}): number {
  if (input.wipeBaseline == null) return 0;
  if (input.wipeBaseline.frozenPreLossPeak <= 0) return 0;
  return input.currentStrategicPower / input.wipeBaseline.frozenPreLossPeak;
}

/**
 * Advances the tracker one day. For each not-yet-recorded milestone,
 * increments the streak when fraction >= milestone, resets to 0 otherwise,
 * and records the day once the streak hits
 * {@link RECOVERY_SUSTAINED_DAYS_REQUIRED}. Sets `relapsed: true` (sticky)
 * the first time fraction drops below the highest milestone recorded.
 */
export function updateRecoveryTracker(input: {
  readonly tracker: RecoveryTracker;
  readonly currentDay: number;
  readonly currentStrategicPower: number;
  readonly wipeBaseline: WipeBaseline;
}): {
  readonly tracker: RecoveryTracker;
  readonly milestonesSustained: readonly number[];
  readonly relapsed: boolean;
} {
  if (!Number.isInteger(input.currentDay) || input.currentDay < 0) {
    throw new SimulationConfigError(
      `updateRecoveryTracker currentDay must be a non-negative integer; received ${input.currentDay}`,
      'lifecycle-recovery-invalid-day',
    );
  }
  if (
    !Number.isFinite(input.currentStrategicPower) ||
    input.currentStrategicPower < 0
  ) {
    throw new SimulationInvariantError({
      day: input.currentDay,
      playerId: '',
      field: 'currentStrategicPower',
      value: input.currentStrategicPower,
      reason: input.currentStrategicPower < 0 ? 'negative' : 'not-finite',
    });
  }

  const fraction = computeRecoveryFraction({
    currentStrategicPower: input.currentStrategicPower,
    wipeBaseline: input.wipeBaseline,
  });

  const counters: Record<number, number> = {
    ...input.tracker.sustainedCounters,
  };
  const crossings: Record<number, number | null> = {
    ...input.tracker.firstSustainedCrossings,
  };
  for (const milestone of RECOVERY_MILESTONES) {
    if (counters[milestone] == null) {
      counters[milestone] =
        crossings[milestone] != null ? RECOVERY_SUSTAINED_DAYS_REQUIRED : 0;
    }
  }

  const newlySustained: number[] = [];
  let highest = input.tracker.highestMilestoneReached;
  let sustainedAtHighest = input.tracker.sustainedDaysAtHighest;
  let { relapsed } = input.tracker;

  for (const milestone of RECOVERY_MILESTONES) {
    if (crossings[milestone] != null) {
      counters[milestone] = RECOVERY_SUSTAINED_DAYS_REQUIRED;
      continue;
    }
    const reached = fraction >= milestone;
    if (reached) {
      counters[milestone] = Math.min(
        RECOVERY_SUSTAINED_DAYS_REQUIRED,
        counters[milestone] + 1,
      );
      if (counters[milestone] >= RECOVERY_SUSTAINED_DAYS_REQUIRED) {
        crossings[milestone] = input.currentDay;
        newlySustained.push(milestone);
        if (milestone > highest) {
          highest = milestone;
          sustainedAtHighest = RECOVERY_SUSTAINED_DAYS_REQUIRED;
        }
      }
    } else {
      counters[milestone] = 0;
    }
  }

  if (highest > 0 && newlySustained.length === 0) {
    sustainedAtHighest =
      fraction >= highest
        ? Math.min(RECOVERY_SUSTAINED_DAYS_REQUIRED, sustainedAtHighest + 1)
        : 0;
  }

  if (highest > 0 && fraction < highest) {
    relapsed = true;
  }

  const next: RecoveryTracker = {
    firstSustainedCrossings: crossings,
    highestMilestoneReached: highest,
    sustainedDaysAtHighest: sustainedAtHighest,
    relapsed,
    sustainedCounters: counters,
  };
  return { tracker: next, milestonesSustained: newlySustained, relapsed };
}

// ============================================================
// Candidate rebuild shield integration
// ============================================================

/**
 * Delegates to `./rulesets.advanceRebuildShield` when a shield exists.
 * Returns null when no shield is active (production ruleset).
 */
export function advanceShield(input: {
  readonly shield: RebuildShieldState | null;
  readonly policy: RebuildShieldPolicy | null;
  readonly event: RebuildShieldEvent;
}): RebuildShieldState | null {
  if (input.shield == null || input.policy == null) return null;
  return advanceRebuildShield(input.policy, input.shield, input.event);
}

export function isShieldActive(shield: RebuildShieldState | null): boolean {
  return shield != null && !shield.expired;
}

// ============================================================
// Intra-run adaptation
// ============================================================

export interface AdaptationOutcome {
  readonly day: number;
  readonly value: number;
  readonly label?: string;
}

/**
 * Per-player adaptation state. `tactics` carries signed deltas to apply
 * on top of the persona's baseline. Persona is intentionally NOT here:
 * adaptation MUST NOT change persona.
 */
export interface AdaptationState {
  readonly recentOutcomes: readonly AdaptationOutcome[];
  readonly lastAdaptedOnDay: number | null;
  readonly tactics: Readonly<{
    readonly aggressionDelta: number;
    readonly riskToleranceDelta: number;
    readonly wealthPreferenceDelta: number;
  }>;
}

export function createInitialAdaptationState(): AdaptationState {
  return {
    recentOutcomes: [],
    lastAdaptedOnDay: null,
    tactics: {
      aggressionDelta: 0,
      riskToleranceDelta: 0,
      wealthPreferenceDelta: 0,
    },
  };
}

export function recordAdaptationOutcome(input: {
  readonly state: AdaptationState;
  readonly day: number;
  readonly value: number;
  readonly label?: string;
}): AdaptationState {
  if (!Number.isInteger(input.day) || input.day < 0) {
    throw new SimulationConfigError(
      `recordAdaptationOutcome day must be a non-negative integer; received ${input.day}`,
      'lifecycle-adaptation-invalid-day',
    );
  }
  if (!Number.isFinite(input.value)) {
    throw new SimulationInvariantError({
      day: input.day,
      playerId: '',
      field: 'adaptationOutcomeValue',
      value: input.value,
      reason: 'not-finite',
    });
  }
  const outcome: AdaptationOutcome = {
    day: input.day,
    value: input.value,
    label: input.label,
  };
  const recentOutcomes = [...input.state.recentOutcomes, outcome].slice(
    -ADAPTATION_ROLLING_OUTCOME_WINDOW,
  );
  return { ...input.state, recentOutcomes };
}

/**
 * Adaptation fires every {@link ADAPTATION_INTERVAL_DAYS} days (anchored
 * to day 0), and only when at least one outcome has been recorded and
 * adaptation has not already fired on the same day.
 */
export function shouldAdapt(input: {
  readonly state: AdaptationState;
  readonly currentDay: number;
}): boolean {
  if (!Number.isInteger(input.currentDay) || input.currentDay < 0) {
    throw new SimulationConfigError(
      `shouldAdapt currentDay must be a non-negative integer; received ${input.currentDay}`,
      'lifecycle-adaptation-invalid-day',
    );
  }
  if (input.state.recentOutcomes.length === 0) return false;
  if (input.state.lastAdaptedOnDay === input.currentDay) return false;
  return (input.currentDay + 1) % ADAPTATION_INTERVAL_DAYS === 0;
}

export function sumRecentOutcomes(state: AdaptationState): number {
  return state.recentOutcomes.reduce((sum, o) => sum + o.value, 0);
}

/**
 * Deterministic 3-region heuristic from the rolling outcome sum:
 *   - sum < -threshold → tighten defense (aggression -, wealth +)
 *   - sum > +threshold → press advantage (aggression +, risk +)
 *   - otherwise        → relax all deltas toward zero by one step
 *
 * Each delta is clamped to ±{@link ADAPTATION_TACTICS_MAX_DELTA}. Persona
 * is accepted only so callers can assert it remains unchanged.
 */
export function adaptTactics(input: {
  readonly state: AdaptationState;
  readonly currentDay: number;
  readonly persona: Persona;
}): {
  readonly state: AdaptationState;
  readonly changes: readonly string[];
} {
  if (!Number.isInteger(input.currentDay) || input.currentDay < 0) {
    throw new SimulationConfigError(
      `adaptTactics currentDay must be a non-negative integer; received ${input.currentDay}`,
      'lifecycle-adaptation-invalid-day',
    );
  }

  const sum = sumRecentOutcomes(input.state);
  const step = ADAPTATION_TACTICS_STEP;
  const maxDelta = ADAPTATION_TACTICS_MAX_DELTA;

  let { aggressionDelta } = input.state.tactics;
  let riskDelta = input.state.tactics.riskToleranceDelta;
  let wealthDelta = input.state.tactics.wealthPreferenceDelta;
  const changes: string[] = [];

  if (sum < -ADAPTATION_OUTCOME_THRESHOLD) {
    aggressionDelta = clampDelta(aggressionDelta - step, maxDelta);
    wealthDelta = clampDelta(wealthDelta + step, maxDelta);
    changes.push('tightened-defense');
  } else if (sum > ADAPTATION_OUTCOME_THRESHOLD) {
    aggressionDelta = clampDelta(aggressionDelta + step, maxDelta);
    riskDelta = clampDelta(riskDelta + step, maxDelta);
    changes.push('pressed-advantage');
  } else {
    aggressionDelta = clampTowardZero(aggressionDelta, step, maxDelta);
    riskDelta = clampTowardZero(riskDelta, step, maxDelta);
    wealthDelta = clampTowardZero(wealthDelta, step, maxDelta);
    changes.push('normalized');
  }

  return {
    state: {
      recentOutcomes: input.state.recentOutcomes,
      lastAdaptedOnDay: input.currentDay,
      tactics: {
        aggressionDelta,
        riskToleranceDelta: riskDelta,
        wealthPreferenceDelta: wealthDelta,
      },
    },
    changes,
  };
}

function clampDelta(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    throw new SimulationInvariantError({
      day: 0,
      playerId: '',
      field: 'tacticsDelta',
      value,
      reason: 'not-finite',
    });
  }
  return Math.max(-max, Math.min(max, value));
}

function clampTowardZero(value: number, step: number, max: number): number {
  if (value === 0) return 0;
  const next = value > 0 ? value - step : value + step;
  return clampDelta(next, max);
}

// ============================================================
// Convenience: lifecycle status helpers
// ============================================================

export function lifecycleStatusForActivity(input: {
  readonly activityClass: ActivityClass;
  readonly current: LifecycleStatus;
}): LifecycleStatus {
  if (input.activityClass === 'inactive') return 'inactive';
  if (input.activityClass === 'rebuilding') return 'rebuilding';
  return input.current;
}
