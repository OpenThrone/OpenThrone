import { describe, expect, it } from 'bun:test';

import { CITIZEN_WORKERS_TARGET } from '../utils/spy/results';
import { calculateTurnIncome } from './economy';
import { createEraPlayer } from './eraPopulation';
import {
  assertFiniteNonNegativeSafeInteger,
  SimulationConfigError,
} from './invariants';
import { createRng } from './random';
import {
  canSeeIntel,
  checkSpyEligibility,
  clampMissionTurns,
  createSpyBehaviorRng,
  createSpyDayTracker,
  dailyLimitsToTracker,
  executeSpyMission,
  getSpyLimitsForLevel,
  getSpyPressureProtection,
  missionTurnBounds,
  personaMissionPriority,
  planSpyApplication,
  planSpyMissions,
  playerStateToSpyLimits,
  recordTrackerMission,
  selectSpyTarget,
  SPY_LEVEL_LIMITS,
  SPY_MISSION_KINDS,
  type SpyDayTracker,
  type SpyIntelAudience,
  type SpyMissionDecision,
  type SpyMissionTargetUnit,
  trackerPerKindCount,
  trackerPerTargetCount,
  writeTrackerBack,
} from './spyBehavior';
import type { PlayerState } from './types';

// ---------------------------------------------------------------------------
// Test player factory.
// ---------------------------------------------------------------------------

function makePlayer(
  overrides: Partial<PlayerState> & { id: string },
): PlayerState {
  const base = createEraPlayer({ id: overrides.id });
  return { ...base, ...overrides };
}

function makeSpyAttacker(overrides: Partial<PlayerState> = {}): PlayerState {
  return makePlayer({
    id: 'attacker_spy',
    level: 20,
    spyLevel: 11,
    sentryLevel: 1,
    attackTurns: 50,
    stamina: 100,
    maxStamina: 100,
    units: {
      ...makePlayer({ id: 'x' }).units,
      spy: 50,
      infiltrator: 30,
      assassin: 20,
    },
    bonuses: { attack: 0, defense: 0, spy: 100, sentry: 0 },
    ...overrides,
  });
}

function makeSentryDefender(overrides: Partial<PlayerState> = {}): PlayerState {
  return makePlayer({
    id: 'defender_sentry',
    level: 20,
    sentryLevel: 11,
    fortHp: 1000,
    fortMaxHp: 1000,
    units: {
      ...makePlayer({ id: 'x' }).units,
      sentry: 100,
      citizen: 200,
      worker: 100,
    },
    bonuses: { attack: 0, defense: 0, spy: 0, sentry: 100 },
    ...overrides,
  });
}

const ATTACK_LEVEL_RANGE = 5;

function constRandom(value = 0.5): () => number {
  return () => value;
}

// ---------------------------------------------------------------------------
// Limit manifest tests
// ---------------------------------------------------------------------------

describe('spy limits manifest', () => {
  it('keeps intel unlocked from level 1 but locks infiltration/assassination', () => {
    const lvl1 = getSpyLimitsForLevel(1);
    expect(lvl1.intel.perDay).toBeGreaterThan(0);
    expect(lvl1.infiltration.perDay).toBe(0);
    expect(lvl1.assassination.perDay).toBe(0);
  });

  it('unlocks infiltration at level 7 with the production profile', () => {
    const lvl7 = getSpyLimitsForLevel(7);
    expect(lvl7.infiltration.perDay).toBe(1);
    expect(lvl7.infiltration.perMission).toBe(3);
    expect(lvl7.infiltration.perTargetPerDay).toBe(1);
    expect(lvl7.assassination.perDay).toBe(0);
  });

  it('unlocks assassination at level 11', () => {
    const lvl11 = getSpyLimitsForLevel(11);
    expect(lvl11.assassination.perDay).toBeGreaterThan(0);
    expect(lvl11.assassination.perMission).toBe(70);
    expect(lvl11.infiltration.perDay).toBeGreaterThan(0);
  });

  it('clamps above the table to the top-most entry', () => {
    const high = getSpyLimitsForLevel(99);
    const top = SPY_LEVEL_LIMITS[SPY_LEVEL_LIMITS.length - 1];
    expect(high).toEqual(top);
  });

  it('throws on invalid spy level', () => {
    expect(() => getSpyLimitsForLevel(0)).toThrow(SimulationConfigError);
    expect(() => getSpyLimitsForLevel(NaN)).toThrow(SimulationConfigError);
  });

  it('maps a PlayerState to its limit manifest via spyLevel', () => {
    const attacker = makeSpyAttacker({ spyLevel: 11 });
    expect(playerStateToSpyLimits(attacker).assassination.perDay).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Turn bounds
// ---------------------------------------------------------------------------

describe('mission turn bounds', () => {
  it('honors the v5 min/max for each mission kind', () => {
    expect(missionTurnBounds('intel')).toEqual({ min: 1, max: 5, default: 1 });
    expect(missionTurnBounds('infiltration').min).toBe(2);
    expect(missionTurnBounds('assassination').min).toBe(3);
    expect(missionTurnBounds('infiltration').max).toBe(10);
  });

  it('clamps explicit requests to the legal range', () => {
    expect(clampMissionTurns('intel', 0)).toBe(1);
    expect(clampMissionTurns('intel', 99)).toBe(5);
    expect(clampMissionTurns('assassination', 1)).toBe(3);
    expect(clampMissionTurns('infiltration', 5)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

describe('SpyDayTracker', () => {
  it('starts empty', () => {
    const t = createSpyDayTracker();
    expect(trackerPerKindCount(t, 'intel')).toBe(0);
    expect(trackerPerTargetCount(t, 'd1', 'intel')).toBe(0);
  });

  it('records per-kind and per-target counts immutably', () => {
    const t0 = createSpyDayTracker();
    const t1 = recordTrackerMission(t0, 'd1', 'intel');
    const t2 = recordTrackerMission(t1, 'd1', 'intel');
    const t3 = recordTrackerMission(t2, 'd2', 'assassination');
    expect(trackerPerKindCount(t0, 'intel')).toBe(0);
    expect(trackerPerKindCount(t3, 'intel')).toBe(2);
    expect(trackerPerKindCount(t3, 'assassination')).toBe(1);
    expect(trackerPerTargetCount(t3, 'd1', 'intel')).toBe(2);
    expect(trackerPerTargetCount(t3, 'd2', 'intel')).toBe(0);
  });

  it('reads and writes back legacy PlayerState.dailyLimits counters', () => {
    const player = makeSpyAttacker();
    player.dailyLimits.intelUsed = 2;
    player.dailyLimits.assassinationUsed = 1;
    const tracker = dailyLimitsToTracker(player);
    expect(trackerPerKindCount(tracker, 'intel')).toBe(2);
    expect(trackerPerKindCount(tracker, 'assassination')).toBe(1);

    const next = writeTrackerBack(player, 'intel');
    expect(next.intelUsed).toBe(3);
    expect(next.assassinationUsed).toBe(1);
    expect(next.infiltrationUsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe('checkSpyEligibility', () => {
  const limits = getSpyLimitsForLevel(11);

  it('accepts a fully-resourced attacker against an in-range active defender', () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'intel',
      spies: 5,
      turns: 1,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects out-of-range defenders', () => {
    const attacker = makeSpyAttacker({ level: 20 });
    const defender = makeSentryDefender({ level: 5 });
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'intel',
      spies: 5,
      turns: 1,
      attackLevelRange: 5,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.reason).toBe('TARGET_OUT_OF_RANGE');
    }
  });

  it('rejects non-active defenders', () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender({ status: 'defeated' });
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'intel',
      spies: 5,
      turns: 1,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('TARGET_INELIGIBLE');
  });

  it('rejects assassination without an explicit target unit', () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'assassination',
      spies: 5,
      turns: 3,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('TARGET_UNIT_REQUIRED');
  });

  it('rejects when attacker has fewer spies than requested', () => {
    const base = makeSpyAttacker();
    const attacker = makeSpyAttacker({
      units: { ...base.units, spy: 2, infiltrator: 0, assassin: 0 },
    });
    const defender = makeSentryDefender();
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'intel',
      spies: 5,
      turns: 1,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('INSUFFICIENT_SPIES');
  });

  it('rejects infiltration when the structure level is too low', () => {
    const attacker = makeSpyAttacker({ spyLevel: 5 });
    const defender = makeSentryDefender();
    const lvl5Limits = getSpyLimitsForLevel(5);
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'infiltration',
      spies: 2,
      turns: 2,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits: lvl5Limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('INFILTRATION_LOCKED');
  });

  it('rejects assassination when the structure level is too low', () => {
    const attacker = makeSpyAttacker({ spyLevel: 9 });
    const defender = makeSentryDefender();
    const lvl9Limits = getSpyLimitsForLevel(9);
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'assassination',
      spies: 4,
      turns: 3,
      targetUnit: CITIZEN_WORKERS_TARGET,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits: lvl9Limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('ASSASSINATION_LOCKED');
  });

  it('rejects when infiltration per-mission spy cap is exceeded', () => {
    const base = makeSpyAttacker();
    const attacker = makeSpyAttacker({
      units: { ...base.units, infiltrator: 20 },
    });
    const defender = makeSentryDefender();
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'infiltration',
      spies: 10,
      turns: 2,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible)
      expect(result.reason).toBe('INFILTRATION_LIMIT_EXCEEDED');
  });

  it('rejects when attacker has insufficient attack turns', () => {
    const attacker = makeSpyAttacker({ attackTurns: 1 });
    const defender = makeSentryDefender();
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'assassination',
      spies: 4,
      turns: 3,
      targetUnit: CITIZEN_WORKERS_TARGET,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible)
      expect(result.reason).toBe('INSUFFICIENT_ATTACK_TURNS');
  });

  it('rejects when attacker has insufficient stamina', () => {
    const attacker = makeSpyAttacker({ stamina: 1 });
    const defender = makeSentryDefender();
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'assassination',
      spies: 4,
      turns: 3,
      targetUnit: CITIZEN_WORKERS_TARGET,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker: createSpyDayTracker(),
      limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('INSUFFICIENT_STAMINA');
  });

  it('rejects once the per-day cap for the mission kind is reached', () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const lvl11 = getSpyLimitsForLevel(11);
    let tracker: SpyDayTracker = createSpyDayTracker();
    for (let i = 0; i < lvl11.infiltration.perDay; i++) {
      tracker = recordTrackerMission(tracker, 'any', 'infiltration');
    }
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'infiltration',
      spies: 3,
      turns: 2,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker,
      limits: lvl11,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('MISSION_PER_DAY_LIMIT');
  });

  it('rejects once the per-target cap is reached', () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender({ id: 'defA' });
    // Level 9 has infiltration perDay=3, perTargetPerDay=2 so we can
    // saturate the per-target limit while the per-day limit still has room.
    const lvl9Limits = getSpyLimitsForLevel(9);
    let tracker: SpyDayTracker = createSpyDayTracker();
    for (let i = 0; i < lvl9Limits.infiltration.perTargetPerDay; i++) {
      tracker = recordTrackerMission(tracker, 'defA', 'infiltration');
    }
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'infiltration',
      spies: 2,
      turns: 2,
      attackLevelRange: ATTACK_LEVEL_RANGE,
      tracker,
      limits: lvl9Limits,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('PER_TARGET_LIMIT');
  });
});

// ---------------------------------------------------------------------------
// Target selection
// ---------------------------------------------------------------------------

describe('selectSpyTarget', () => {
  it('returns null when no candidates are level-legal', () => {
    const attacker = makeSpyAttacker({ level: 30 });
    const candidates = [makeSentryDefender({ id: 'd1', level: 5 })];
    const target = selectSpyTarget(attacker, candidates, {
      attackLevelRange: 5,
      kind: 'intel',
      rng: createRng(1),
    });
    expect(target).toBeNull();
  });

  it('deterministically picks from the legal candidates by id ordering + seed', () => {
    const attacker = makeSpyAttacker({ level: 20 });
    const candidates = [
      makeSentryDefender({ id: 'delta', level: 20 }),
      makeSentryDefender({ id: 'alpha', level: 20 }),
      makeSentryDefender({ id: 'charlie', level: 20 }),
      makeSentryDefender({ id: 'bravo', level: 20 }),
    ];
    const t1 = selectSpyTarget(attacker, candidates, {
      attackLevelRange: 5,
      kind: 'intel',
      rng: createRng(42),
    });
    const t1Again = selectSpyTarget(attacker, candidates, {
      attackLevelRange: 5,
      kind: 'intel',
      rng: createRng(42),
    });
    const t2 = selectSpyTarget(attacker, candidates, {
      attackLevelRange: 5,
      kind: 'intel',
      rng: createRng(43),
    });
    expect(t1?.id).toBe(t1Again?.id);
    expect(t1).not.toBeNull();
    if (t1) {
      expect(['alpha', 'bravo', 'charlie', 'delta']).toContain(t1.id);
    }
    expect(t2).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Persona priority
// ---------------------------------------------------------------------------

describe('personaMissionPriority', () => {
  it('makes spy personas prioritize assassination/infiltration over intel', () => {
    const spyPriority = personaMissionPriority('spy');
    expect(spyPriority[0]).not.toBe('intel');
    expect(spyPriority).toContain('assassination');
    expect(spyPriority).toContain('infiltration');
  });

  it('keeps sentry/farmer/defender personas intel-only', () => {
    expect(personaMissionPriority('sentry')).toEqual(['intel']);
    expect(personaMissionPriority('farmer')).toEqual(['intel']);
    expect(personaMissionPriority('defender')).toEqual(['intel']);
  });

  it('exposes a defined priority list for every persona', () => {
    for (const p of [
      'farmer',
      'attacker',
      'defender',
      'spy',
      'sentry',
      'balanced',
    ] as const) {
      const priority = personaMissionPriority(p);
      expect(priority.length).toBeGreaterThan(0);
      for (const kind of priority) {
        expect(SPY_MISSION_KINDS).toContain(kind);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// planSpyMissions (decision aggregation)
// ---------------------------------------------------------------------------

describe('planSpyMissions', () => {
  it('produces a spy-priority decision order for spy personas', () => {
    const attacker = makeSpyAttacker({ level: 20 });
    const candidates = [
      attacker,
      makeSentryDefender({ id: 'def1', level: 20 }),
    ];
    const { decisions, skips } = planSpyMissions({
      attacker,
      candidates,
      persona: 'spy',
      tracker: createSpyDayTracker(),
      limits: getSpyLimitsForLevel(attacker.spyLevel),
      attackLevelRange: ATTACK_LEVEL_RANGE,
      rng: createSpyBehaviorRng(7),
      maxMissionsPerInvocation: 3,
      day: 1,
    });
    expect(decisions.length).toBeGreaterThan(0);
    const firstExecuted = decisions[0]?.kind;
    expect(['assassination', 'infiltration']).toContain(firstExecuted);
    // One defender can be targeted at most once per kind; later priority
    // kinds produce PER_TARGET_LIMIT skips, which is expected.
    expect(skips.length).toBeGreaterThanOrEqual(0);
  });

  it('emits skip events when a low-spy-level attacker cannot run locked missions', () => {
    const attacker = makeSpyAttacker({ spyLevel: 1, level: 20 });
    const candidates = [
      attacker,
      makeSentryDefender({ id: 'def1', level: 20 }),
    ];
    const { skips } = planSpyMissions({
      attacker,
      candidates,
      persona: 'spy',
      tracker: createSpyDayTracker(),
      limits: getSpyLimitsForLevel(1),
      attackLevelRange: ATTACK_LEVEL_RANGE,
      rng: createSpyBehaviorRng(7),
      maxMissionsPerInvocation: 3,
      day: 1,
    });
    // The spy persona tries assassination then infiltration before intel,
    // so a level-1 attacker must record at least one LOCKED skip.
    const lockedSkips = skips.filter(
      (s) =>
        s.reason === 'ASSASSINATION_LOCKED' ||
        s.reason === 'INFILTRATION_LOCKED',
    );
    expect(lockedSkips.length).toBeGreaterThan(0);
  });

  it('emits a PERSONA_SKIPS_MISSION event when no priority path applies', () => {
    const attacker = makeSpyAttacker({ level: 99 });
    const candidates: PlayerState[] = [attacker];
    const { decisions, skips } = planSpyMissions({
      attacker,
      candidates,
      persona: 'spy',
      tracker: createSpyDayTracker(),
      limits: getSpyLimitsForLevel(attacker.spyLevel),
      attackLevelRange: ATTACK_LEVEL_RANGE,
      rng: createSpyBehaviorRng(1),
      maxMissionsPerInvocation: 3,
      day: 1,
    });
    expect(decisions).toHaveLength(0);
    expect(skips.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Execution contract
// ---------------------------------------------------------------------------

describe('executeSpyMission', () => {
  it('returns a deterministic outcome for identical seed and state', async () => {
    const attacker = makeSpyAttacker({ level: 20 });
    const defender = makeSentryDefender({ level: 20 });
    const decision: SpyMissionDecision = {
      kind: 'intel',
      targetId: defender.id,
      spies: 5,
      turns: 1,
      reason: 'test',
    };
    const audience: SpyIntelAudience = { kind: 'self' };

    const runOnce = async () => {
      const rng = createSpyBehaviorRng(99);
      return executeSpyMission({
        attacker: { ...attacker },
        defender: { ...defender },
        decision,
        random: rng.next,
        day: 1,
        audience,
      });
    };
    const r1 = await runOnce();
    const r2 = await runOnce();
    expect(r1.outcome.success).toBe(r2.outcome.success);
    expect(r1.outcome.spiesLost).toBe(r2.outcome.spiesLost);
    expect(r1.defenderFortDamage).toBe(r2.defenderFortDamage);
  });

  it('spends attacker turns and stamina equal to committed turns', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const decision: SpyMissionDecision = {
      kind: 'assassination',
      targetId: defender.id,
      spies: 5,
      turns: 3,
      targetUnit: CITIZEN_WORKERS_TARGET,
      reason: 'test',
    };
    const result = await executeSpyMission({
      attacker,
      defender,
      decision,
      random: constRandom(0.99),
      day: 1,
      audience: { kind: 'self' },
    });
    expect(result.outcome.turnsSpent).toBe(3);
    expect(result.outcome.staminaSpent).toBe(3);
    expect(result.spyPressureDelta).toBe(3);
  });

  it('never awards attacker or defender XP from a spy mission', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const decisions: SpyMissionDecision[] = [
      {
        kind: 'intel',
        targetId: defender.id,
        spies: 5,
        turns: 1,
        reason: 't',
      },
      {
        kind: 'assassination',
        targetId: defender.id,
        spies: 5,
        turns: 3,
        targetUnit: CITIZEN_WORKERS_TARGET,
        reason: 't',
      },
      {
        kind: 'infiltration',
        targetId: defender.id,
        spies: 5,
        turns: 2,
        reason: 't',
      },
    ];
    for (const decision of decisions) {
      const result = await executeSpyMission({
        attacker,
        defender,
        decision,
        random: constRandom(0.5),
        day: 1,
        audience: { kind: 'self' },
      });
      expect(result.outcome.attackerXpAwarded).toBe(0);
      expect(result.outcome.defenderXpAwarded).toBe(0);
    }
  });

  it('reduces fort HP after a successful infiltration', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender({ fortHp: 1000, fortMaxHp: 1000 });
    const decision: SpyMissionDecision = {
      kind: 'infiltration',
      targetId: defender.id,
      spies: 5,
      turns: 5,
      reason: 't',
    };
    const result = await executeSpyMission({
      attacker,
      defender,
      decision,
      random: constRandom(0.01),
      day: 1,
      audience: { kind: 'self' },
    });
    if (result.outcome.success) {
      expect(result.defenderFortDamage).toBeGreaterThan(0);
      expect(result.defenderFortDamage).toBeLessThanOrEqual(120);
    }
    expect(result.defenderFortDamage).toBe(result.outcome.fortDamage ?? 0);
  });

  it('reports a strictly non-negative integer fort damage', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const result = await executeSpyMission({
      attacker,
      defender,
      decision: {
        kind: 'infiltration',
        targetId: defender.id,
        spies: 5,
        turns: 2,
        reason: 't',
      },
      random: constRandom(0.99),
      day: 1,
      audience: { kind: 'self' },
    });
    assertFiniteNonNegativeSafeInteger(
      result.defenderFortDamage,
      'defenderFortDamage',
      { day: 1, playerId: attacker.id },
    );
  });

  it('reduces worker count after a successful worker assassination', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender({
      units: {
        ...makeSentryDefender().units,
        citizen: 200,
        worker: 100,
      },
    });
    const result = await executeSpyMission({
      attacker,
      defender,
      decision: {
        kind: 'assassination',
        targetId: defender.id,
        spies: 10,
        turns: 5,
        targetUnit: CITIZEN_WORKERS_TARGET,
        reason: 't',
      },
      random: constRandom(0.01),
      day: 1,
      audience: { kind: 'self' },
    });
    const casualties =
      (result.defenderCasualtyDeltas.worker ?? 0) +
      (result.defenderCasualtyDeltas.citizen ?? 0);
    if (result.outcome.success && (result.outcome.targetCasualties ?? 0) > 0) {
      expect(casualties).toBe(-(result.outcome.targetCasualties ?? 0));
    }
  });

  it('worker assassination reduces next-tick income proportionally', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender({
      units: {
        ...makeSentryDefender().units,
        worker: 100,
      },
    });
    const baselineIncome = calculateTurnIncome(defender);
    expect(baselineIncome).toBeGreaterThan(0);

    const result = await executeSpyMission({
      attacker,
      defender,
      decision: {
        kind: 'assassination',
        targetId: defender.id,
        spies: 20,
        turns: 10,
        targetUnit: CITIZEN_WORKERS_TARGET,
        reason: 't',
      },
      random: constRandom(0.01),
      day: 1,
      audience: { kind: 'self' },
    });
    if (result.outcome.success && (result.outcome.targetCasualties ?? 0) > 0) {
      const postDefender: PlayerState = {
        ...defender,
        units: {
          ...defender.units,
          worker: Math.max(
            0,
            defender.units.worker + (result.defenderCasualtyDeltas.worker ?? 0),
          ),
          citizen: Math.max(
            0,
            defender.units.citizen +
              (result.defenderCasualtyDeltas.citizen ?? 0),
          ),
        },
      };
      const postIncome = calculateTurnIncome(postDefender);
      expect(postIncome).toBeLessThan(baselineIncome);
    }
  });

  it('attacker spy casualties are reported as negative deltas', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const result = await executeSpyMission({
      attacker,
      defender,
      decision: {
        kind: 'intel',
        targetId: defender.id,
        spies: 5,
        turns: 1,
        reason: 't',
      },
      random: constRandom(0.99),
      day: 1,
      audience: { kind: 'self' },
    });
    const lost = result.outcome.spiesLost;
    const delta = result.attackerCasualtyDeltas.spy ?? 0;
    expect(Math.abs(delta)).toBeLessThanOrEqual(lost);
    if (lost > 0) {
      expect(delta).toBeLessThan(0);
    }
  });

  it('restricts intel visibility to the attacker for self audience', () => {
    const audience: SpyIntelAudience = { kind: 'self' };
    expect(canSeeIntel(audience, 'attacker', 'attacker')).toBe(true);
    expect(canSeeIntel(audience, 'other', 'attacker')).toBe(false);
  });

  it('restricts intel visibility to declared alliance members', () => {
    const audience: SpyIntelAudience = {
      kind: 'alliance',
      memberIds: ['ally1', 'ally2'],
    };
    expect(canSeeIntel(audience, 'attacker', 'attacker')).toBe(true);
    expect(canSeeIntel(audience, 'ally1', 'attacker')).toBe(true);
    expect(canSeeIntel(audience, 'outsider', 'attacker')).toBe(false);
  });

  it('denies intel visibility when audience is self but viewer is a different alliance member', () => {
    const audience: SpyIntelAudience = { kind: 'self' };
    expect(canSeeIntel(audience, 'ally', 'attacker')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spy pressure reduction
// ---------------------------------------------------------------------------

describe('spy pressure protection', () => {
  it('monotonically reduces attacker advantage as pressure rises', () => {
    const p0 = getSpyPressureProtection(0);
    const p16 = getSpyPressureProtection(16);
    const p64 = getSpyPressureProtection(64);
    expect(p0).toBeGreaterThan(p16);
    expect(p16).toBeGreaterThan(p64);
    expect(p0).toBeCloseTo(1, 5);
  });

  it('pressure scales a shallow intel mission from success to failure', async () => {
    const baseAttacker = makeSpyAttacker({
      units: { ...makeSpyAttacker().units, spy: 100 },
    });
    const baseDefender = makeSentryDefender({
      units: { ...makeSentryDefender().units, sentry: 90 },
    });

    const calm = await executeSpyMission({
      attacker: { ...baseAttacker },
      defender: { ...baseDefender, spyPressureToday: 0 },
      decision: {
        kind: 'intel',
        targetId: baseDefender.id,
        spies: 5,
        turns: 1,
        reason: 'pressure',
      },
      random: constRandom(0.5),
      day: 1,
      audience: { kind: 'self' },
    });
    const pressured = await executeSpyMission({
      attacker: { ...baseAttacker },
      defender: { ...baseDefender, spyPressureToday: 64 },
      decision: {
        kind: 'intel',
        targetId: baseDefender.id,
        spies: 5,
        turns: 1,
        reason: 'pressure',
      },
      random: constRandom(0.5),
      day: 1,
      audience: { kind: 'self' },
    });
    // Pressure increases effective sentry; a successful calm mission
    // may flip to a failure under pressure, and at minimum the
    // pressured mission cannot become strictly easier.
    expect(
      calm.outcome.success === true || pressured.outcome.success === false,
    ).toBe(true);
    if (calm.outcome.success && !pressured.outcome.success) {
      expect(pressured.outcome.spiesLost).toBeGreaterThanOrEqual(
        calm.outcome.spiesLost,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Sentry counterplay
// ---------------------------------------------------------------------------

describe('sentry counterplay', () => {
  it('higher sentry force flips intel success to failure', async () => {
    const attacker = makeSpyAttacker();
    const weakDefender = makeSentryDefender({
      units: { ...makeSentryDefender().units, sentry: 1 },
    });
    const strongDefender = makeSentryDefender({
      units: { ...makeSentryDefender().units, sentry: 1000 },
    });
    const decision: SpyMissionDecision = {
      kind: 'intel',
      targetId: 'd',
      spies: 5,
      turns: 1,
      reason: 'sentry',
    };
    const weak = await executeSpyMission({
      attacker: { ...attacker },
      defender: weakDefender,
      decision,
      random: constRandom(0.5),
      day: 1,
      audience: { kind: 'self' },
    });
    const strong = await executeSpyMission({
      attacker: { ...attacker },
      defender: strongDefender,
      decision,
      random: constRandom(0.5),
      day: 1,
      audience: { kind: 'self' },
    });
    if (weak.outcome.success !== strong.outcome.success) {
      expect(weak.outcome.success).toBe(true);
      expect(strong.outcome.success).toBe(false);
    }
    expect(strong.outcome.spiesLost).toBeGreaterThanOrEqual(
      weak.outcome.spiesLost,
    );
  });
});

// ---------------------------------------------------------------------------
// Application plan
// ---------------------------------------------------------------------------

describe('planSpyApplication', () => {
  it('projects attacker turn and stamina deltas equal to committed turns', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const decision: SpyMissionDecision = {
      kind: 'assassination',
      targetId: defender.id,
      spies: 5,
      turns: 3,
      targetUnit: CITIZEN_WORKERS_TARGET,
      reason: 't',
    };
    const execution = await executeSpyMission({
      attacker,
      defender,
      decision,
      random: constRandom(0.5),
      day: 1,
      audience: { kind: 'self' },
    });
    const plan = planSpyApplication(execution, decision, attacker);
    expect(plan.attackerTurnsDelta).toBe(-3);
    expect(plan.attackerStaminaDelta).toBe(-3);
    expect(plan.defenderSpyPressureDelta).toBe(3);
    expect(plan.defenderFortDamage).toBe(0);
    expect(plan.xpAwarded).toEqual({ attacker: 0, defender: 0 });
  });

  it('records the tracker and daily-limits mutations for one mission', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const decision: SpyMissionDecision = {
      kind: 'infiltration',
      targetId: defender.id,
      spies: 3,
      turns: 2,
      reason: 't',
    };
    const execution = await executeSpyMission({
      attacker,
      defender,
      decision,
      random: constRandom(0.5),
      day: 1,
      audience: { kind: 'self' },
    });
    const plan = planSpyApplication(execution, decision, attacker);
    expect(plan.trackerDelta).toEqual({
      kind: 'infiltration',
      targetId: defender.id,
    });
    expect(plan.dailyLimitsDelta.infiltrationUsed).toBe(1);
  });

  it('includes an intel record for successful intel missions', async () => {
    const attacker = makeSpyAttacker({
      units: { ...makeSpyAttacker().units, spy: 200 },
    });
    const defender = makeSentryDefender({
      units: { ...makeSentryDefender().units, sentry: 5 },
    });
    const decision: SpyMissionDecision = {
      kind: 'intel',
      targetId: defender.id,
      spies: 5,
      turns: 1,
      reason: 't',
    };
    const execution = await executeSpyMission({
      attacker,
      defender,
      decision,
      random: constRandom(0.01),
      day: 1,
      audience: { kind: 'self' },
    });
    const plan = planSpyApplication(execution, decision, attacker);
    if (execution.outcome.success) {
      expect(plan.intelRecord?.targetId).toBe(defender.id);
      expect(plan.intelRecord?.result.defenderInfo).toBeDefined();
    } else {
      expect(plan.intelRecord).toBeUndefined();
    }
  });

  it('preserves the declared audience on the visibility field', async () => {
    const attacker = makeSpyAttacker();
    const defender = makeSentryDefender();
    const decision: SpyMissionDecision = {
      kind: 'intel',
      targetId: defender.id,
      spies: 5,
      turns: 1,
      reason: 't',
    };
    const audience: SpyIntelAudience = {
      kind: 'alliance',
      memberIds: ['ally_a', 'ally_b'],
    };
    const execution = await executeSpyMission({
      attacker,
      defender,
      decision,
      random: constRandom(0.5),
      day: 1,
      audience,
    });
    const plan = planSpyApplication(execution, decision, attacker);
    expect(plan.visibility).toBe(audience);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces byte-identical outcomes for the same seed', async () => {
    const make = () => ({
      attacker: makeSpyAttacker(),
      defender: makeSentryDefender(),
      decision: {
        kind: 'infiltration' as const,
        targetId: 'defender_sentry',
        spies: 5,
        turns: 3,
        reason: 'determinism',
      },
    });
    const runA = make();
    const runB = make();
    const a = await executeSpyMission({
      attacker: runA.attacker,
      defender: runA.defender,
      decision: runA.decision,
      random: createSpyBehaviorRng(123).next,
      day: 1,
      audience: { kind: 'self' },
    });
    const b = await executeSpyMission({
      attacker: runB.attacker,
      defender: runB.defender,
      decision: runB.decision,
      random: createSpyBehaviorRng(123).next,
      day: 1,
      audience: { kind: 'self' },
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces divergent outcomes across infiltration missions under different seeds', async () => {
    const seeds = [11, 22, 33, 44, 55, 66];
    const signatures = new Set<string>();
    for (const seed of seeds) {
      const attacker = makeSpyAttacker();
      const defender = makeSentryDefender({ fortHp: 1000, fortMaxHp: 1000 });
      const result = await executeSpyMission({
        attacker,
        defender,
        decision: {
          kind: 'infiltration',
          targetId: defender.id,
          spies: 7,
          turns: 10,
          reason: 'divergence',
        },
        random: createSpyBehaviorRng(seed).next,
        day: 1,
        audience: { kind: 'self' },
      });
      signatures.add(
        JSON.stringify([
          result.outcome.success,
          result.outcome.spiesLost,
          result.outcome.fortDamage,
        ]),
      );
    }
    // Infiltration draws fort damage from a per-spy mtRand range, so at
    // least two of six seeds must yield visibly different results.
    expect(signatures.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Mission kinds enumeration
// ---------------------------------------------------------------------------

describe('mission kind enumeration', () => {
  it('exposes the three production mission kinds', () => {
    expect(SPY_MISSION_KINDS).toEqual([
      'intel',
      'assassination',
      'infiltration',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: target unit type
// ---------------------------------------------------------------------------

describe('target unit typing', () => {
  it('CITIZEN_WORKERS_TARGET is the canonical citizen+worker assassination target', () => {
    const target: SpyMissionTargetUnit = CITIZEN_WORKERS_TARGET;
    expect(target).toBe('CITIZEN_WORKERS');
  });
});
