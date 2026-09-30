import { describe, expect, it } from 'bun:test';

import { SimulationConfigError, SimulationInvariantError } from './invariants';
import {
  ACTIVE_DAILY_ACTION_PROBABILITY,
  ADAPTATION_INTERVAL_DAYS,
  ADAPTATION_TACTICS_MAX_DELTA,
  ADAPTATION_TACTICS_STEP,
  type AdaptationState,
  adaptTactics,
  advanceShield,
  computeInactivityProbability,
  computeRecoveryFraction,
  computeTrailingPeak,
  createInitialActivitySchedule,
  createInitialAdaptationState,
  createInitialInactivityState,
  createInitialMeaningfulActionLog,
  createInitialRecoveryTracker,
  createInitialStrategicPowerHistory,
  daysSinceLastMeaningfulAction,
  enterRebuilding,
  evaluateDailyActivity,
  evaluateInactivity,
  evaluateReactivation,
  getReactivationProbability,
  INACTIVITY_BASE_PROBABILITY_ACTIVE,
  INACTIVITY_BASE_PROBABILITY_PASSIVE,
  type InactivityState,
  isMeaningfulAction,
  isPreLossFarmerFalseWipeCandidate,
  isShieldActive,
  MEANINGFUL_ACTION_DROUGHT_BOOST,
  MEANINGFUL_ACTION_DROUGHT_THRESHOLD_DAYS,
  MEANINGFUL_ACTION_KINDS,
  type MeaningfulActionKind,
  type MeaningfulActionLog,
  PASSIVE_NEXT_ACTION_MAX_DELAY_DAYS,
  PASSIVE_NEXT_ACTION_MIN_DELAY_DAYS,
  POST_WIPE_BOOST_WINDOW_DAYS,
  POST_WIPE_INACTIVITY_BOOST,
  REACTIVATION_PROBABILITY_ACTIVE,
  REACTIVATION_PROBABILITY_PASSIVE,
  recordAdaptationOutcome,
  recordMeaningfulAction,
  recordStrategicPowerSample,
  RECOVERY_MILESTONES,
  RECOVERY_SUSTAINED_DAYS_REQUIRED,
  rollActiveDailyAction,
  rollInactivity,
  rollPassiveNextActionDelay,
  rollReactivation,
  shouldAdapt,
  shouldWipe,
  STRATEGIC_POWER_TRAILING_WINDOW_DAYS,
  type StrategicPowerHistory,
  sumRecentOutcomes,
  updateRecoveryTracker,
  WIPE_POWER_FRACTION_THRESHOLD,
} from './lifecycle';
import { createRng } from './random';
import { CANDIDATE_SAFETY_RULESET, PRODUCTION_RULESET } from './rulesets';

describe('lifecycle — activity scheduling', () => {
  it('exposes the 90% active daily action probability constant', () => {
    expect(ACTIVE_DAILY_ACTION_PROBABILITY).toBe(0.9);
  });

  it('exposes the 1-3 day passive delay bounds', () => {
    expect(PASSIVE_NEXT_ACTION_MIN_DELAY_DAYS).toBe(1);
    expect(PASSIVE_NEXT_ACTION_MAX_DELAY_DAYS).toBe(3);
  });

  it('rollActiveDailyAction fires below the 0.9 boundary and not at/above it', () => {
    expect(rollActiveDailyAction(0)).toBe(true);
    expect(rollActiveDailyAction(0.89)).toBe(true);
    expect(rollActiveDailyAction(0.899999)).toBe(true);
    expect(rollActiveDailyAction(0.9)).toBe(false);
    expect(rollActiveDailyAction(0.95)).toBe(false);
  });

  it('rejects NaN / out-of-range rolls via validateRandomDraw', () => {
    expect(() => rollActiveDailyAction(Number.NaN)).toThrow(RangeError);
    expect(() => rollActiveDailyAction(-0.01)).toThrow(RangeError);
    expect(() => rollActiveDailyAction(1)).toThrow(RangeError);
  });

  it('active initial schedule rolls a 90% action opportunity on the join day', () => {
    const rng = createRng(42);
    const schedule = createInitialActivitySchedule({
      activityClass: 'active',
      joinedOnDay: 0,
      rng,
    });
    expect(schedule.lastEvaluatedDay).toBe(0);
    expect(schedule.nextActionDay).toBe(0);
    expect(typeof schedule.actsToday).toBe('boolean');
  });

  it('passive initial schedule defers first action 1-3 days ahead (seeded)', () => {
    const seed = 7;
    const rng = createRng(seed);
    const delay = rollPassiveNextActionDelay(createRng(seed));
    const schedule = createInitialActivitySchedule({
      activityClass: 'passive',
      joinedOnDay: 5,
      rng,
    });
    expect(schedule.actsToday).toBe(false);
    expect(schedule.nextActionDay).toBe(5 + delay);
    expect(delay).toBeGreaterThanOrEqual(PASSIVE_NEXT_ACTION_MIN_DELAY_DAYS);
    expect(delay).toBeLessThanOrEqual(PASSIVE_NEXT_ACTION_MAX_DELAY_DAYS);
  });

  it('active evaluateDailyActivity re-rolls each day and never moves backwards', () => {
    const rng = createRng(123);
    const initial = createInitialActivitySchedule({
      activityClass: 'active',
      joinedOnDay: 0,
      rng,
    });
    const day1 = evaluateDailyActivity({
      activityClass: 'active',
      currentDay: 1,
      schedule: initial,
      rng: createRng(123),
    });
    expect(day1.lastEvaluatedDay).toBe(1);
    expect(day1.nextActionDay).toBe(1);

    expect(() =>
      evaluateDailyActivity({
        activityClass: 'active',
        currentDay: 0,
        schedule: day1,
        rng: createRng(123),
      }),
    ).toThrow(SimulationConfigError);
  });

  it('passive evaluateDailyActivity acts on the scheduled day then reschedules', () => {
    const rng = createRng(99);
    let schedule = createInitialActivitySchedule({
      activityClass: 'passive',
      joinedOnDay: 0,
      rng,
    });
    expect(schedule.actsToday).toBe(false);
    expect(schedule.nextActionDay).toBeGreaterThan(0);

    while (schedule.nextActionDay < 10) {
      const today = schedule.nextActionDay;
      const next = evaluateDailyActivity({
        activityClass: 'passive',
        currentDay: today,
        schedule,
        rng: createRng(99),
      });
      expect(next.actsToday).toBe(true);
      expect(next.nextActionDay).toBeGreaterThan(today);
      schedule = next;
    }
  });

  it('inactive and rebuilding users never act', () => {
    for (const activityClass of ['inactive', 'rebuilding'] as const) {
      const schedule = evaluateDailyActivity({
        activityClass,
        currentDay: 5,
        schedule: {
          lastEvaluatedDay: 0,
          nextActionDay: 1,
          actsToday: true,
        },
        rng: createRng(1),
      });
      expect(schedule.actsToday).toBe(false);
      expect(schedule.lastEvaluatedDay).toBe(5);
    }
  });
});

describe('lifecycle — inactivity / reactivation', () => {
  it('exposes the spec-pinned probability constants', () => {
    expect(INACTIVITY_BASE_PROBABILITY_ACTIVE).toBe(0.001);
    expect(INACTIVITY_BASE_PROBABILITY_PASSIVE).toBe(0.003);
    expect(POST_WIPE_INACTIVITY_BOOST).toBe(0.05);
    expect(POST_WIPE_BOOST_WINDOW_DAYS).toBe(7);
    expect(MEANINGFUL_ACTION_DROUGHT_BOOST).toBe(0.01);
    expect(MEANINGFUL_ACTION_DROUGHT_THRESHOLD_DAYS).toBe(7);
    expect(REACTIVATION_PROBABILITY_ACTIVE).toBe(0.1);
    expect(REACTIVATION_PROBABILITY_PASSIVE).toBe(0.05);
  });

  it('active base is 0.1% with no boosts', () => {
    const p = computeInactivityProbability({
      originalActivityClass: 'active',
      wipedOnDay: null,
      currentDay: 10,
      lastMeaningfulActionDay: 9,
    });
    expect(p).toBeCloseTo(0.001, 10);
  });

  it('passive base is 0.3% with no boosts', () => {
    const p = computeInactivityProbability({
      originalActivityClass: 'passive',
      wipedOnDay: null,
      currentDay: 10,
      lastMeaningfulActionDay: 9,
    });
    expect(p).toBeCloseTo(0.003, 10);
  });

  it('adds +5 pp once within the 7-day post-wipe window', () => {
    const wipedOnDay = 10;
    for (let offset = 0; offset < POST_WIPE_BOOST_WINDOW_DAYS; offset++) {
      const day = wipedOnDay + offset;
      const p = computeInactivityProbability({
        originalActivityClass: 'active',
        wipedOnDay,
        currentDay: day,
        lastMeaningfulActionDay: day,
      });
      expect(p).toBeCloseTo(0.001 + 0.05, 10);
    }
  });

  it('drops the +5 pp on day 7 after wipe (window is <7)', () => {
    const p = computeInactivityProbability({
      originalActivityClass: 'active',
      wipedOnDay: 10,
      currentDay: 10 + POST_WIPE_BOOST_WINDOW_DAYS,
      lastMeaningfulActionDay: 10 + POST_WIPE_BOOST_WINDOW_DAYS,
    });
    expect(p).toBeCloseTo(0.001, 10);
  });

  it('adds +1 pp after a 7-day meaningful-action drought', () => {
    const p = computeInactivityProbability({
      originalActivityClass: 'active',
      wipedOnDay: null,
      currentDay: 20,
      lastMeaningfulActionDay: 20 - MEANINGFUL_ACTION_DROUGHT_THRESHOLD_DAYS,
    });
    expect(p).toBeCloseTo(0.001 + 0.01, 10);
  });

  it('treats "never acted" as a drought from day 7 onward', () => {
    const p = computeInactivityProbability({
      originalActivityClass: 'active',
      wipedOnDay: null,
      currentDay: MEANINGFUL_ACTION_DROUGHT_THRESHOLD_DAYS,
      lastMeaningfulActionDay: null,
    });
    expect(p).toBeCloseTo(0.001 + 0.01, 10);
  });

  it('stacks post-wipe and drought boosts additively', () => {
    const p = computeInactivityProbability({
      originalActivityClass: 'passive',
      wipedOnDay: 10,
      currentDay: 12,
      lastMeaningfulActionDay: 5,
    });
    expect(p).toBeCloseTo(0.003 + 0.05 + 0.01, 10);
  });

  it('rolls trigger below the probability and not at/above it', () => {
    expect(rollInactivity(0, 0.001)).toBe(true);
    expect(rollInactivity(0.000999, 0.001)).toBe(true);
    expect(rollInactivity(0.001, 0.001)).toBe(false);
    expect(rollInactivity(0.01, 0.001)).toBe(false);
  });

  it('rejects NaN/out-of-range rolls and invalid probabilities', () => {
    expect(() => rollInactivity(Number.NaN, 0.001)).toThrow(RangeError);
    expect(() => rollInactivity(0.5, Number.NaN)).toThrow(
      SimulationConfigError,
    );
    expect(() => rollInactivity(0.5, -0.1)).toThrow(SimulationConfigError);
    expect(() => rollInactivity(0.5, 1.1)).toThrow(SimulationConfigError);
  });

  it('evaluateInactivity skips already-inactive players', () => {
    const state: InactivityState = {
      inactiveSinceDay: 5,
      originalActivityClass: 'active',
    };
    const result = evaluateInactivity({
      state,
      probability: 1,
      roll: 0,
    });
    expect(result.becameInactive).toBe(false);
    expect(result.state).toBe(state);
  });

  it('evaluateInactivity records inactiveSinceDay=0 on a successful roll', () => {
    const state = createInitialInactivityState('active');
    const result = evaluateInactivity({
      state,
      probability: 0.5,
      roll: 0.4,
    });
    expect(result.becameInactive).toBe(true);
    expect(result.state.inactiveSinceDay).toBe(0);
    expect(result.state.originalActivityClass).toBe('active');
  });

  it('getReactivationProbability returns 10%/5% per original class', () => {
    expect(getReactivationProbability('active')).toBe(0.1);
    expect(getReactivationProbability('passive')).toBe(0.05);
  });

  it('rollReactivation boundary is strict-less for active and passive', () => {
    expect(rollReactivation(0.099, 'active')).toBe(true);
    expect(rollReactivation(0.1, 'active')).toBe(false);
    expect(rollReactivation(0.049, 'passive')).toBe(true);
    expect(rollReactivation(0.05, 'passive')).toBe(false);
  });

  it('evaluateReactivation restores the player when the roll fires', () => {
    const inactive: InactivityState = {
      inactiveSinceDay: 5,
      originalActivityClass: 'passive',
    };
    const result = evaluateReactivation({
      state: inactive,
      roll: 0.04,
    });
    expect(result.reactivated).toBe(true);
    expect(result.state.inactiveSinceDay).toBeNull();
    expect(result.state.originalActivityClass).toBe('passive');
  });

  it('evaluateReactivation is a no-op for already-active players', () => {
    const state = createInitialInactivityState('active');
    const result = evaluateReactivation({
      state,
      roll: 0,
    });
    expect(result.reactivated).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe('lifecycle — meaningful-action classifier', () => {
  it('exposes the seven qualifying kinds', () => {
    expect(MEANINGFUL_ACTION_KINDS).toEqual([
      'training',
      'purchase',
      'repair',
      'bank',
      'recruitment',
      'spy',
      'pvp',
    ]);
  });

  it('counts an action meaningful when kind qualifies and delta is strictly positive', () => {
    for (const kind of MEANINGFUL_ACTION_KINDS) {
      expect(isMeaningfulAction({ kind, resourceDelta: 1 })).toBe(true);
      expect(isMeaningfulAction({ kind, resourceDelta: 0.5 })).toBe(true);
    }
  });

  it('rejects zero-delta and negative-delta attempts', () => {
    for (const kind of MEANINGFUL_ACTION_KINDS) {
      expect(isMeaningfulAction({ kind, resourceDelta: 0 })).toBe(false);
      expect(isMeaningfulAction({ kind, resourceDelta: -10 })).toBe(false);
    }
  });

  it('rejects unknown kinds', () => {
    expect(
      isMeaningfulAction({
        kind: 'unknown' as unknown as MeaningfulActionKind,
        resourceDelta: 100,
      }),
    ).toBe(false);
  });

  it('throws SimulationInvariantError on NaN deltas', () => {
    expect(() =>
      isMeaningfulAction({ kind: 'training', resourceDelta: Number.NaN }),
    ).toThrow(SimulationInvariantError);
  });

  it('records meaningful days monotonically and de-duplicates same-day', () => {
    let log: MeaningfulActionLog = createInitialMeaningfulActionLog();
    log = recordMeaningfulAction({
      log,
      kind: 'training',
      day: 1,
      resourceDelta: 100,
    });
    log = recordMeaningfulAction({
      log,
      kind: 'training',
      day: 1,
      resourceDelta: 50,
    });
    log = recordMeaningfulAction({
      log,
      kind: 'bank',
      day: 3,
      resourceDelta: 25,
    });
    expect(log.days).toEqual([1, 3]);

    log = recordMeaningfulAction({
      log,
      kind: 'training',
      day: 2,
      resourceDelta: 999,
    });
    expect(log.days).toEqual([1, 3]);
  });

  it('ignores non-meaningful actions entirely', () => {
    let log: MeaningfulActionLog = createInitialMeaningfulActionLog();
    log = recordMeaningfulAction({
      log,
      kind: 'training',
      day: 1,
      resourceDelta: 0,
    });
    log = recordMeaningfulAction({
      log,
      kind: 'training',
      day: 2,
      resourceDelta: -5,
    });
    expect(log.days).toEqual([]);
  });

  it('daysSinceLastMeaningfulAction returns null on an empty log', () => {
    expect(
      daysSinceLastMeaningfulAction(createInitialMeaningfulActionLog(), 10),
    ).toBeNull();
  });

  it('daysSinceLastMeaningfulAction computes the gap from the most recent day', () => {
    const log: MeaningfulActionLog = { days: [1, 5, 7] };
    expect(daysSinceLastMeaningfulAction(log, 7)).toBe(0);
    expect(daysSinceLastMeaningfulAction(log, 14)).toBe(7);
  });
});

describe('lifecycle — strategic power peak', () => {
  it('exposes a 7-day trailing window', () => {
    expect(STRATEGIC_POWER_TRAILING_WINDOW_DAYS).toBe(7);
  });

  it('recordStrategicPowerSample keeps the trailing 7 samples', () => {
    let history: StrategicPowerHistory = createInitialStrategicPowerHistory();
    for (let day = 0; day < 20; day++) {
      history = recordStrategicPowerSample({
        history,
        day,
        power: day * 10,
      });
    }
    expect(history.samples.length).toBe(STRATEGIC_POWER_TRAILING_WINDOW_DAYS);
    expect(history.samples[0]).toEqual({ day: 13, power: 130 });
    expect(history.samples[6]).toEqual({ day: 19, power: 190 });
  });

  it('recordStrategicPowerSample rejects negative/non-finite power', () => {
    expect(() =>
      recordStrategicPowerSample({
        history: createInitialStrategicPowerHistory(),
        day: 0,
        power: -1,
      }),
    ).toThrow(SimulationInvariantError);
    expect(() =>
      recordStrategicPowerSample({
        history: createInitialStrategicPowerHistory(),
        day: 0,
        power: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(SimulationInvariantError);
  });

  it('recordStrategicPowerSample rejects out-of-order days', () => {
    let history: StrategicPowerHistory = createInitialStrategicPowerHistory();
    history = recordStrategicPowerSample({
      history,
      day: 5,
      power: 100,
    });
    expect(() =>
      recordStrategicPowerSample({ history, day: 4, power: 100 }),
    ).toThrow(SimulationConfigError);
  });

  it('computeTrailingPeak returns null on empty history', () => {
    expect(
      computeTrailingPeak(createInitialStrategicPowerHistory(), 10),
    ).toBeNull();
  });

  it('computeTrailingPeak returns the max power inside the trailing 7-day window', () => {
    let history: StrategicPowerHistory = createInitialStrategicPowerHistory();
    for (let day = 0; day < 10; day++) {
      history = recordStrategicPowerSample({
        history,
        day,
        power: day === 5 ? 999 : day * 10,
      });
    }
    expect(computeTrailingPeak(history, 9)).toBe(999);
  });

  it('computeTrailingPeak ignores samples outside the window', () => {
    let history: StrategicPowerHistory = createInitialStrategicPowerHistory();
    history = recordStrategicPowerSample({
      history,
      day: 0,
      power: 5000,
    });
    history = recordStrategicPowerSample({ history, day: 9, power: 50 });
    expect(computeTrailingPeak(history, 10)).toBe(50);
  });
});

describe('lifecycle — wipe detection', () => {
  it('exposes the 25% wipe threshold', () => {
    expect(WIPE_POWER_FRACTION_THRESHOLD).toBe(0.25);
  });

  it('does NOT wipe when fort HP > 0 even if power is well below peak', () => {
    expect(
      shouldWipe({ fortHp: 1, strategicPower: 1, frozenPreLossPeak: 1000 }),
    ).toBe(false);
    expect(
      shouldWipe({ fortHp: 500, strategicPower: 0, frozenPreLossPeak: 1000 }),
    ).toBe(false);
  });

  it('does NOT wipe when peak is null (pre-loss Farmer false wipe guard)', () => {
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 0, frozenPreLossPeak: null }),
    ).toBe(false);
  });

  it('does NOT wipe when peak is non-positive', () => {
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 0, frozenPreLossPeak: 0 }),
    ).toBe(false);
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 0, frozenPreLossPeak: -1 }),
    ).toBe(false);
  });

  it('does NOT wipe when power is at or above 25% of peak (AND semantics)', () => {
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 25, frozenPreLossPeak: 100 }),
    ).toBe(false);
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 24.999, frozenPreLossPeak: 100 }),
    ).toBe(true);
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 90, frozenPreLossPeak: 100 }),
    ).toBe(false);
  });

  it('wipes when fort HP is zero AND power < 25% of peak', () => {
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 10, frozenPreLossPeak: 100 }),
    ).toBe(true);
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 0, frozenPreLossPeak: 100 }),
    ).toBe(true);
  });

  it('rejects non-finite inputs via SimulationInvariantError', () => {
    expect(() =>
      shouldWipe({
        fortHp: Number.NaN,
        strategicPower: 10,
        frozenPreLossPeak: 100,
      }),
    ).toThrow(SimulationInvariantError);
    expect(() =>
      shouldWipe({
        fortHp: 0,
        strategicPower: Number.POSITIVE_INFINITY,
        frozenPreLossPeak: 100,
      }),
    ).toThrow(SimulationInvariantError);
  });

  it('isPreLossFarmerFalseWipeCandidate flags only pre-loss Farmers', () => {
    expect(
      isPreLossFarmerFalseWipeCandidate({
        persona: 'farmer',
        frozenPreLossPeak: null,
      }),
    ).toBe(true);
    expect(
      isPreLossFarmerFalseWipeCandidate({
        persona: 'farmer',
        frozenPreLossPeak: 0,
      }),
    ).toBe(true);
    expect(
      isPreLossFarmerFalseWipeCandidate({
        persona: 'farmer',
        frozenPreLossPeak: 100,
      }),
    ).toBe(false);
    expect(
      isPreLossFarmerFalseWipeCandidate({
        persona: 'attacker',
        frozenPreLossPeak: null,
      }),
    ).toBe(false);
  });

  it('no false wipe for a low-power Farmer that never established a peak', () => {
    let history: StrategicPowerHistory = createInitialStrategicPowerHistory();
    history = recordStrategicPowerSample({
      history,
      day: 0,
      power: 5,
    });
    history = recordStrategicPowerSample({
      history,
      day: 1,
      power: 5,
    });
    const peak = computeTrailingPeak(history, 1);
    expect(peak).toBe(5);
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 5, frozenPreLossPeak: peak }),
    ).toBe(false);
  });

  it('wipes for a Farmer whose power dropped below 25% of a real peak', () => {
    let history: StrategicPowerHistory = createInitialStrategicPowerHistory();
    history = recordStrategicPowerSample({
      history,
      day: 0,
      power: 100,
    });
    history = recordStrategicPowerSample({
      history,
      day: 1,
      power: 100,
    });
    const peak = computeTrailingPeak(history, 1);
    expect(
      shouldWipe({ fortHp: 0, strategicPower: 20, frozenPreLossPeak: peak }),
    ).toBe(true);
  });
});

describe('lifecycle — wipe / rebuild entry', () => {
  it('freezes the baseline and produces a wipe event with persona-agnostic shape', () => {
    const entry = enterRebuilding({
      playerId: 'player_42',
      wipedOnDay: 17,
      frozenPreLossPeak: 1000,
      ruleset: PRODUCTION_RULESET,
    });
    expect(entry.wipeBaseline).toEqual({
      frozenPreLossPeak: 1000,
      wipedOnDay: 17,
    });
    expect(entry.lifecycleStatus).toBe('rebuilding');
    expect(entry.shield).toBeNull();
    expect(entry.recovery).toEqual(createInitialRecoveryTracker());
    expect(entry.event).toMatchObject({
      kind: 'wipe',
      day: 17,
      actorId: 'player_42',
      reason: 'wipe-unshielded',
      value: 1000,
    });
  });

  it('activates the candidate rebuild shield under candidateSafety ruleset', () => {
    const entry = enterRebuilding({
      playerId: 'player_42',
      wipedOnDay: 17,
      frozenPreLossPeak: 1000,
      ruleset: CANDIDATE_SAFETY_RULESET,
    });
    expect(entry.shield).not.toBeNull();
    expect(entry.shield?.playerId).toBe('player_42');
    expect(entry.shield?.activatedOnDay).toBe(17);
    expect(entry.shield?.frozenPreWipeStrategicPower).toBe(1000);
    expect(entry.shield?.remainingDays).toBe(
      CANDIDATE_SAFETY_RULESET.rebuildShield?.durationDays,
    );
    expect(entry.shield?.expired).toBe(false);
    expect(entry.event.reason).toBe('wipe-shielded');
  });

  it('rejects invalid days and non-positive peaks', () => {
    expect(() =>
      enterRebuilding({
        playerId: 'p',
        wipedOnDay: -1,
        frozenPreLossPeak: 100,
        ruleset: PRODUCTION_RULESET,
      }),
    ).toThrow(SimulationConfigError);
    expect(() =>
      enterRebuilding({
        playerId: 'p',
        wipedOnDay: 0,
        frozenPreLossPeak: 0,
        ruleset: PRODUCTION_RULESET,
      }),
    ).toThrow(SimulationConfigError);
  });
});

describe('lifecycle — recovery tracking', () => {
  it('exposes the 25/50/90 milestones and the 3-day sustained requirement', () => {
    expect(RECOVERY_MILESTONES).toEqual([0.25, 0.5, 0.9]);
    expect(RECOVERY_SUSTAINED_DAYS_REQUIRED).toBe(3);
  });

  it('createInitialRecoveryTracker seeds all milestones null and zero counters', () => {
    const tracker = createInitialRecoveryTracker();
    for (const milestone of RECOVERY_MILESTONES) {
      expect(tracker.firstSustainedCrossings[milestone]).toBeNull();
      expect(tracker.sustainedCounters[milestone]).toBe(0);
    }
    expect(tracker.highestMilestoneReached).toBe(0);
    expect(tracker.sustainedDaysAtHighest).toBe(0);
    expect(tracker.relapsed).toBe(false);
  });

  it('computeRecoveryFraction is the ratio to the frozen peak', () => {
    expect(
      computeRecoveryFraction({
        currentStrategicPower: 50,
        wipeBaseline: { frozenPreLossPeak: 200, wipedOnDay: 0 },
      }),
    ).toBeCloseTo(0.25, 10);
    expect(
      computeRecoveryFraction({
        currentStrategicPower: 50,
        wipeBaseline: null,
      }),
    ).toBe(0);
  });

  it('records the first sustained three-day crossing of 25%', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    let tracker = createInitialRecoveryTracker();
    for (let day = 1; day <= 3; day++) {
      const result = updateRecoveryTracker({
        tracker,
        currentDay: day,
        currentStrategicPower: 25,
        wipeBaseline: baseline,
      });
      tracker = result.tracker;
    }
    expect(tracker.firstSustainedCrossings[0.25]).toBe(3);
    expect(tracker.firstSustainedCrossings[0.5]).toBeNull();
    expect(tracker.firstSustainedCrossings[0.9]).toBeNull();
    expect(tracker.highestMilestoneReached).toBe(0.25);
  });

  it('does NOT record when only held for two days', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    let tracker = createInitialRecoveryTracker();
    for (let day = 1; day <= 2; day++) {
      const result = updateRecoveryTracker({
        tracker,
        currentDay: day,
        currentStrategicPower: 50,
        wipeBaseline: baseline,
      });
      tracker = result.tracker;
    }
    expect(tracker.firstSustainedCrossings[0.25]).toBeNull();
    expect(tracker.firstSustainedCrossings[0.5]).toBeNull();
    expect(tracker.sustainedCounters[0.5]).toBe(2);
  });

  it('records each milestone at its own first sustained day', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    let tracker = createInitialRecoveryTracker();
    for (let day = 1; day <= 10; day++) {
      const power = day <= 3 ? 25 : day <= 6 ? 50 : 90;
      const result = updateRecoveryTracker({
        tracker,
        currentDay: day,
        currentStrategicPower: power,
        wipeBaseline: baseline,
      });
      tracker = result.tracker;
    }
    expect(tracker.firstSustainedCrossings[0.25]).toBe(3);
    expect(tracker.firstSustainedCrossings[0.5]).toBe(6);
    expect(tracker.firstSustainedCrossings[0.9]).toBe(9);
    expect(tracker.highestMilestoneReached).toBe(0.9);
    expect(tracker.relapsed).toBe(false);
  });

  it('resets a milestone streak when the player dips below it before sustaining', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    let tracker = createInitialRecoveryTracker();
    let result = updateRecoveryTracker({
      tracker,
      currentDay: 1,
      currentStrategicPower: 50,
      wipeBaseline: baseline,
    });
    tracker = result.tracker;
    result = updateRecoveryTracker({
      tracker,
      currentDay: 2,
      currentStrategicPower: 50,
      wipeBaseline: baseline,
    });
    tracker = result.tracker;
    expect(tracker.sustainedCounters[0.5]).toBe(2);

    result = updateRecoveryTracker({
      tracker,
      currentDay: 3,
      currentStrategicPower: 10,
      wipeBaseline: baseline,
    });
    tracker = result.tracker;
    expect(tracker.sustainedCounters[0.5]).toBe(0);
    expect(tracker.firstSustainedCrossings[0.5]).toBeNull();
  });

  it('flags relapse when fraction drops below the highest recorded milestone', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    let tracker = createInitialRecoveryTracker();
    for (let day = 1; day <= 3; day++) {
      const result = updateRecoveryTracker({
        tracker,
        currentDay: day,
        currentStrategicPower: 50,
        wipeBaseline: baseline,
      });
      tracker = result.tracker;
    }
    expect(tracker.highestMilestoneReached).toBe(0.5);
    expect(tracker.relapsed).toBe(false);

    const result = updateRecoveryTracker({
      tracker,
      currentDay: 4,
      currentStrategicPower: 10,
      wipeBaseline: baseline,
    });
    expect(result.relapsed).toBe(true);
    expect(result.tracker.relapsed).toBe(true);
  });

  it('relapse is sticky for the lifetime of the tracker', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    let tracker = createInitialRecoveryTracker();
    for (let day = 1; day <= 3; day++) {
      const result = updateRecoveryTracker({
        tracker,
        currentDay: day,
        currentStrategicPower: 50,
        wipeBaseline: baseline,
      });
      tracker = result.tracker;
    }
    let result = updateRecoveryTracker({
      tracker,
      currentDay: 4,
      currentStrategicPower: 10,
      wipeBaseline: baseline,
    });
    tracker = result.tracker;
    expect(tracker.relapsed).toBe(true);

    result = updateRecoveryTracker({
      tracker,
      currentDay: 5,
      currentStrategicPower: 90,
      wipeBaseline: baseline,
    });
    expect(result.tracker.relapsed).toBe(true);
  });

  it('backfills missing sustainedCounters from a hand-constructed tracker', () => {
    const baseline = { frozenPreLossPeak: 100, wipedOnDay: 0 };
    const handConstructed = {
      firstSustainedCrossings: { 0.25: null, 0.5: null, 0.9: null },
      highestMilestoneReached: 0,
      sustainedDaysAtHighest: 0,
      relapsed: false,
    };
    const result = updateRecoveryTracker({
      tracker: handConstructed as never,
      currentDay: 1,
      currentStrategicPower: 30,
      wipeBaseline: baseline,
    });
    expect(result.tracker.sustainedCounters[0.25]).toBe(1);
  });
});

describe('lifecycle — candidate rebuild shield integration', () => {
  it('advanceShield returns null when no shield is active', () => {
    expect(
      advanceShield({
        shield: null,
        policy: null,
        event: { kind: 'dayElapsed', currentDay: 1 },
      }),
    ).toBeNull();
  });

  it('advanceShield delegates to rulesets.advanceRebuildShield on each event', () => {
    const entry = enterRebuilding({
      playerId: 'p',
      wipedOnDay: 10,
      frozenPreLossPeak: 1000,
      ruleset: CANDIDATE_SAFETY_RULESET,
    });
    expect(entry.shield).not.toBeNull();
    const policy = CANDIDATE_SAFETY_RULESET.rebuildShield!;

    const afterPvp = advanceShield({
      shield: entry.shield,
      policy,
      event: { kind: 'outgoingPvp', currentDay: 11 },
    })!;
    expect(afterPvp.expired).toBe(true);
    expect(afterPvp.expiryReason).toBe('outgoingPvp');
    expect(afterPvp.remainingDays).toBe(0);

    expect(isShieldActive(entry.shield)).toBe(true);
    expect(isShieldActive(afterPvp)).toBe(false);
  });

  it('advanceShield expires on power recovery at 50% of frozen peak', () => {
    const entry = enterRebuilding({
      playerId: 'p',
      wipedOnDay: 10,
      frozenPreLossPeak: 1000,
      ruleset: CANDIDATE_SAFETY_RULESET,
    });
    const policy = CANDIDATE_SAFETY_RULESET.rebuildShield!;

    const below = advanceShield({
      shield: entry.shield,
      policy,
      event: {
        kind: 'powerSampled',
        currentDay: 11,
        currentStrategicPower: 499,
      },
    });
    expect(below?.expired).toBe(false);

    const at = advanceShield({
      shield: entry.shield,
      policy,
      event: {
        kind: 'powerSampled',
        currentDay: 11,
        currentStrategicPower: 500,
      },
    });
    expect(at?.expired).toBe(true);
    expect(at?.expiryReason).toBe('powerRecovered');
  });

  it('advanceShield expires on duration elapsed (day 8 of candidate)', () => {
    const entry = enterRebuilding({
      playerId: 'p',
      wipedOnDay: 10,
      frozenPreLossPeak: 1000,
      ruleset: CANDIDATE_SAFETY_RULESET,
    });
    const policy = CANDIDATE_SAFETY_RULESET.rebuildShield!;
    let shield = entry.shield!;
    for (let day = 11; day < 18; day++) {
      shield = advanceShield({
        shield,
        policy,
        event: { kind: 'dayElapsed', currentDay: day },
      })!;
    }
    expect(shield.expired).toBe(true);
    expect(shield.expiryReason).toBe('durationElapsed');
  });

  it('advanceShield is a no-op for already-expired shields', () => {
    const entry = enterRebuilding({
      playerId: 'p',
      wipedOnDay: 10,
      frozenPreLossPeak: 1000,
      ruleset: CANDIDATE_SAFETY_RULESET,
    });
    const policy = CANDIDATE_SAFETY_RULESET.rebuildShield!;
    const expired = advanceShield({
      shield: entry.shield,
      policy,
      event: { kind: 'outgoingPvp', currentDay: 11 },
    })!;
    const again = advanceShield({
      shield: expired,
      policy,
      event: { kind: 'dayElapsed', currentDay: 12 },
    })!;
    expect(again).toEqual(expired);
  });
});

describe('lifecycle — intra-run adaptation', () => {
  it('exposes the 7-day interval and ±0.2 delta cap', () => {
    expect(ADAPTATION_INTERVAL_DAYS).toBe(7);
    expect(ADAPTATION_TACTICS_MAX_DELTA).toBe(0.2);
    expect(ADAPTATION_TACTICS_STEP).toBe(0.05);
  });

  it('createInitialAdaptationState seeds empty outcomes and zero deltas', () => {
    const state = createInitialAdaptationState();
    expect(state.recentOutcomes).toEqual([]);
    expect(state.lastAdaptedOnDay).toBeNull();
    expect(state.tactics).toEqual({
      aggressionDelta: 0,
      riskToleranceDelta: 0,
      wealthPreferenceDelta: 0,
    });
  });

  it('shouldAdapt is false when there are no outcomes', () => {
    expect(
      shouldAdapt({
        state: createInitialAdaptationState(),
        currentDay: 6,
      }),
    ).toBe(false);
  });

  it('shouldAdapt fires every 7 days (anchored to day 0) once outcomes exist', () => {
    let state = createInitialAdaptationState();
    state = recordAdaptationOutcome({
      state,
      day: 1,
      value: 1,
    });
    const fireDays = [6, 13, 20, 27];
    const idleDays = [0, 1, 5, 7, 12, 14];
    for (const day of fireDays) {
      expect(shouldAdapt({ state, currentDay: day })).toBe(true);
    }
    for (const day of idleDays) {
      expect(shouldAdapt({ state, currentDay: day })).toBe(false);
    }
  });

  it('shouldAdapt does not fire twice on the same day', () => {
    let state: AdaptationState = recordAdaptationOutcome({
      state: createInitialAdaptationState(),
      day: 1,
      value: 1,
    });
    state = { ...state, lastAdaptedOnDay: 6 };
    expect(shouldAdapt({ state, currentDay: 6 })).toBe(false);
  });

  it('recordAdaptationOutcome bounds the rolling window', () => {
    let state = createInitialAdaptationState();
    for (let i = 0; i < 30; i++) {
      state = recordAdaptationOutcome({
        state,
        day: i,
        value: i,
      });
    }
    expect(state.recentOutcomes.length).toBeLessThanOrEqual(14);
    expect(state.recentOutcomes[0].day).toBeGreaterThanOrEqual(16);
  });

  it('sumRecentOutcomes sums the rolling window', () => {
    let state = createInitialAdaptationState();
    state = recordAdaptationOutcome({ state, day: 1, value: 3 });
    state = recordAdaptationOutcome({ state, day: 2, value: -1 });
    state = recordAdaptationOutcome({ state, day: 3, value: 2 });
    expect(sumRecentOutcomes(state)).toBe(4);
  });

  it('adaptTactics tightens defense when outcomes are strongly negative', () => {
    let state = createInitialAdaptationState();
    state = recordAdaptationOutcome({ state, day: 1, value: -3 });
    const before = state.tactics;
    const result = adaptTactics({
      state,
      currentDay: 6,
      persona: 'farmer',
    });
    expect(result.changes).toContain('tightened-defense');
    expect(result.state.tactics.aggressionDelta).toBe(
      before.aggressionDelta - ADAPTATION_TACTICS_STEP,
    );
    expect(result.state.tactics.wealthPreferenceDelta).toBe(
      before.wealthPreferenceDelta + ADAPTATION_TACTICS_STEP,
    );
    expect(result.state.lastAdaptedOnDay).toBe(6);
  });

  it('adaptTactics presses advantage when outcomes are strongly positive', () => {
    let state = createInitialAdaptationState();
    state = recordAdaptationOutcome({ state, day: 1, value: 5 });
    const before = state.tactics;
    const result = adaptTactics({
      state,
      currentDay: 6,
      persona: 'attacker',
    });
    expect(result.changes).toContain('pressed-advantage');
    expect(result.state.tactics.aggressionDelta).toBe(
      before.aggressionDelta + ADAPTATION_TACTICS_STEP,
    );
    expect(result.state.tactics.riskToleranceDelta).toBe(
      before.riskToleranceDelta + ADAPTATION_TACTICS_STEP,
    );
  });

  it('adaptTactics normalizes when outcomes are inside the threshold', () => {
    let state = createInitialAdaptationState();
    state = recordAdaptationOutcome({ state, day: 1, value: 1 });
    const result = adaptTactics({
      state,
      currentDay: 6,
      persona: 'defender',
    });
    expect(result.changes).toContain('normalized');
    expect(result.state.tactics).toEqual({
      aggressionDelta: 0,
      riskToleranceDelta: 0,
      wealthPreferenceDelta: 0,
    });
  });

  it('clamps deltas to ±ADAPTATION_TACTICS_MAX_DELTA across many adaptations', () => {
    let state = createInitialAdaptationState();
    for (let i = 0; i < 20; i++) {
      state = recordAdaptationOutcome({ state, day: i + 1, value: 10 });
      state = adaptTactics({
        state,
        currentDay: i * 7 + 6,
        persona: 'attacker',
      }).state;
    }
    expect(state.tactics.aggressionDelta).toBeLessThanOrEqual(
      ADAPTATION_TACTICS_MAX_DELTA,
    );
    expect(state.tactics.aggressionDelta).toBe(ADAPTATION_TACTICS_MAX_DELTA);
  });

  it('NEVER changes the persona (persona is not even a field on AdaptationState)', () => {
    const state = createInitialAdaptationState();
    expect(state).not.toHaveProperty('persona');
    const result = adaptTactics({
      state: recordAdaptationOutcome({
        state,
        day: 1,
        value: 10,
      }),
      currentDay: 6,
      persona: 'spy',
    });
    expect(result.state).not.toHaveProperty('persona');
  });
});

describe('lifecycle — deterministic seeding end-to-end', () => {
  it('two passive schedules from the same seed produce the same delay sequence', () => {
    const seed = 1337;
    const run = () => {
      const delays: number[] = [];
      const rng = createRng(seed);
      let schedule = createInitialActivitySchedule({
        activityClass: 'passive',
        joinedOnDay: 0,
        rng,
      });
      for (let day = 0; day < 30; day++) {
        schedule = evaluateDailyActivity({
          activityClass: 'passive',
          currentDay: day,
          schedule,
          rng,
        });
        if (schedule.actsToday) {
          delays.push(schedule.nextActionDay - day);
        }
      }
      return delays;
    };
    const delaysA = run();
    const delaysB = run();
    expect(delaysA).toEqual(delaysB);
    expect(delaysA.length).toBeGreaterThan(0);
    for (const d of delaysA) {
      expect(d).toBeGreaterThanOrEqual(PASSIVE_NEXT_ACTION_MIN_DELAY_DAYS);
      expect(d).toBeLessThanOrEqual(PASSIVE_NEXT_ACTION_MAX_DELAY_DAYS);
    }
  });

  it('two different seeds produce at least one different passive delay sequence', () => {
    const run = (seed: number) => {
      const out: number[] = [];
      const rng = createRng(seed);
      let schedule = createInitialActivitySchedule({
        activityClass: 'passive',
        joinedOnDay: 0,
        rng,
      });
      for (let day = 0; day < 50; day++) {
        schedule = evaluateDailyActivity({
          activityClass: 'passive',
          currentDay: day,
          schedule,
          rng,
        });
        if (schedule.actsToday) out.push(schedule.nextActionDay - day);
      }
      return out;
    };
    const a = run(1);
    const b = run(12345);
    expect(a).not.toEqual(b);
  });
});
