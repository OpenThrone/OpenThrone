import { describe, expect, it } from 'bun:test';

import type {
  CohortCumulativeEvents,
  CohortMetricRecord,
} from './cohortMetrics';
import {
  clandestinePower,
  collectCohortMetricsFromInput,
  compositeViability,
  militaryHeadcount,
  nearestRank,
  sentryHeadcount,
  spyHeadcount,
  summarizeQuantiles,
  ZERO_EVENTS,
} from './cohortMetrics';
import type {
  EraPlayerScenarioState,
  Persona,
  ScenarioEvent,
} from './scenarioTypes';
import type { PlayerState, UnitCounts } from './types';

function makeUnits(overrides: Partial<UnitCounts> = {}): UnitCounts {
  return {
    soldier: 0,
    knight: 0,
    berserker: 0,
    guard: 0,
    archer: 0,
    royalGuard: 0,
    spy: 0,
    infiltrator: 0,
    assassin: 0,
    sentry: 0,
    sentinel: 0,
    inquisitor: 0,
    citizen: 0,
    worker: 0,
    ...overrides,
  };
}

function makePlayer(
  overrides: Partial<PlayerState> & { id: string },
): PlayerState {
  return {
    displayName: overrides.id,
    level: 1,
    xp: 0,
    houseLevel: 0,
    gold: 0,
    goldInBank: 0,
    attackTurns: 0,
    stamina: 0,
    maxStamina: 100,
    defensePressureToday: 0,
    spyPressureToday: 0,
    units: makeUnits(),
    items: { meleeAtk: 0, meleeDef: 0, rangedAtk: 0, rangedDef: 0 },
    upgrades: { offense: 0, defense: 0 },
    fortLevel: 1,
    fortHp: 50,
    fortMaxHp: 50,
    spyLevel: 0,
    sentryLevel: 0,
    economyLevel: 0,
    bonuses: { attack: 0, defense: 0, spy: 0, sentry: 0 },
    recruitBonus: 0,
    maximumBankDeposits: 0,
    dailyLimits: {
      attacksUsed: 0,
      intelUsed: 0,
      assassinationUsed: 0,
      infiltrationUsed: 0,
    },
    behavior: {
      aggression: 0,
      riskTolerance: 0,
      activityLevel: 0,
      wealthPreference: 0,
      spyPreference: 0,
      turnStrategy: 'balanced',
      playStyle: 'balanced',
      primaryGoal: 'growth',
    },
    intelCache: new Map(),
    attackHistory: new Map(),
    incomingAttackHistory: new Map(),
    targetMemory: new Map(),
    bankDepositHistory: [],
    status: 'active',
    ...overrides,
  };
}

describe('cohort metrics quantiles', () => {
  it('uses explicit nearest-rank quantiles', () => {
    expect(nearestRank([1, 2, 3, 4, 5], 0.05)).toBe(1);
    expect(nearestRank([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(nearestRank([1, 2, 3, 4, 5], 0.95)).toBe(5);
    expect(summarizeQuantiles([5, 1, 3, 2, 4])).toEqual({
      p05: 1,
      median: 3,
      p95: 5,
    });
  });

  it('rejects out-of-range percentile and empty inputs', () => {
    expect(() => nearestRank([], 0.5)).toThrow();
    expect(() => nearestRank([1, 2, 3], -0.1)).toThrow();
    expect(() => nearestRank([1, 2, 3], 1.1)).toThrow();
  });

  it('returns empty summary for empty inputs in summarizeQuantiles', () => {
    expect(summarizeQuantiles([])).toEqual({ p05: 0, median: 0, p95: 0 });
  });

  it('calculates unity viability for population-median values', () => {
    expect(
      compositeViability({
        income: 100,
        combatPower: 200,
        clandestinePower: 20,
        level: 5,
        populationMedians: {
          income: 100,
          power: 200,
          clandestine: 20,
          level: 5,
        },
      }),
    ).toBe(1);
  });

  it('splits unit counts into military, spy, sentry, and weighted clandestine power', () => {
    const player = makePlayer({
      id: 'u1',
      units: makeUnits({
        soldier: 4,
        knight: 2,
        berserker: 1,
        guard: 8,
        archer: 4,
        royalGuard: 1,
        spy: 3,
        infiltrator: 2,
        assassin: 1,
        sentry: 5,
        sentinel: 1,
        inquisitor: 1,
      }),
    });
    expect(militaryHeadcount(player)).toBe(20);
    expect(spyHeadcount(player)).toBe(6);
    expect(sentryHeadcount(player)).toBe(7);
    expect(clandestinePower(player)).toBe(
      3 + 2 * 2 + 1 * 3 + 5 + 1 * 2 + 1 * 3,
    );
  });
});

describe('collectCohortMetricsFromInput', () => {
  function meta(
    id: string,
    overrides: Partial<EraPlayerScenarioState> & {
      persona: Persona;
      cohortId: string;
    },
  ): EraPlayerScenarioState {
    return {
      activityClass: 'active',
      lifecycleStatus: 'active',
      joinedOnDay: 0,
      ...overrides,
    };
  }

  it('groups players by cohort/persona/activity and emits stable order', () => {
    const p1 = makePlayer({ id: 'p1', level: 2 });
    const p2 = makePlayer({ id: 'p2', level: 4 });
    const p3 = makePlayer({ id: 'p3', level: 6 });
    const playerMeta = new Map<string, EraPlayerScenarioState>([
      [
        'p1',
        meta('p1', {
          persona: 'farmer',
          farmerVariant: 'greedy',
          cohortId: 'primary',
        }),
      ],
      ['p2', meta('p2', { persona: 'attacker', cohortId: 'primary' })],
      [
        'p3',
        meta('p3', {
          persona: 'balanced',
          cohortId: 'lateJoiner-30',
          joinedOnDay: 30,
        }),
      ],
    ]);
    const records = collectCohortMetricsFromInput({
      players: [p1, p2, p3],
      playerMeta,
      allianceMeta: new Map(),
      events: [],
      day: 30,
    });
    expect(records).toHaveLength(3);
    expect(
      records.map((r) => `${r.cohortId}|${r.persona}|${r.activityClass}`),
    ).toEqual([
      'lateJoiner-30|balanced|active',
      'primary|attacker|active',
      'primary|farmer|active',
    ]);
    const farmer = records.find((r) => r.persona === 'farmer')!;
    expect(farmer.count).toBe(1);
    expect(farmer.farmerVariant).toBe('greedy');
    expect(farmer.joinedOnDayRange).toEqual([0, 0]);
    expect(farmer.cumulativeEvents).toEqual(ZERO_EVENTS);
    const lateJoiner = records.find((r) => r.cohortId === 'lateJoiner-30')!;
    expect(lateJoiner.joinedOnDayRange).toEqual([30, 30]);
  });

  it('embeds the same population viability median on every record for the day', () => {
    const p1 = makePlayer({ id: 'p1', level: 5, xp: 1000 });
    const p2 = makePlayer({ id: 'p2', level: 7, xp: 2000 });
    const playerMeta = new Map<string, EraPlayerScenarioState>([
      ['p1', meta('p1', { persona: 'farmer', cohortId: 'primary' })],
      ['p2', meta('p2', { persona: 'attacker', cohortId: 'primary' })],
    ]);
    const records = collectCohortMetricsFromInput({
      players: [p1, p2],
      playerMeta,
      allianceMeta: new Map(),
      events: [],
      day: 0,
    });
    expect(records.length).toBe(2);
    const median = records[0]!.populationViabilityMedian;
    expect(records.every((r) => r.populationViabilityMedian === median)).toBe(
      true,
    );
    expect(Number.isFinite(median)).toBe(true);
  });

  it('aggregates cumulative events by cohort from the deterministic event stream', () => {
    const farmer = makePlayer({ id: 'farmer-1' });
    const target = makePlayer({ id: 'target-1' });
    const recipient = makePlayer({ id: 'rec-1' });
    const playerMeta = new Map<string, EraPlayerScenarioState>([
      [
        'farmer-1',
        meta('farmer-1', { persona: 'farmer', cohortId: 'primary' }),
      ],
      [
        'target-1',
        meta('target-1', { persona: 'attacker', cohortId: 'primary' }),
      ],
      [
        'rec-1',
        meta('rec-1', {
          persona: 'balanced',
          cohortId: 'lateJoiner-30',
          joinedOnDay: 30,
        }),
      ],
    ]);
    const events: ScenarioEvent[] = [
      { kind: 'wipe', day: 5, actorId: 'target-1' },
      { kind: 'recovery', day: 10, actorId: 'target-1', value: 0.5 },
      { kind: 'reactivation', day: 12, actorId: 'farmer-1' },
      { kind: 'adaptation', day: 14, actorId: 'farmer-1' },
      {
        kind: 'focusFireNomination',
        day: 20,
        actorId: 'alliance-leader',
        targetId: 'target-1',
        allianceId: 'alpha',
      },
      { kind: 'recruitmentAward', day: 25, actorId: 'rec-1', value: 250 },
      { kind: 'recruitmentAward', day: 26, actorId: 'rec-1', value: 250 },
      {
        kind: 'allianceAid',
        day: 27,
        actorId: 'alliance-leader',
        targetId: 'rec-1',
        allianceId: 'alpha',
        value: 1500,
      },
    ];
    const records = collectCohortMetricsFromInput({
      players: [farmer, target, recipient],
      playerMeta,
      allianceMeta: new Map(),
      events,
      day: 30,
    });
    const farmerRecord = records.find((r) => r.persona === 'farmer')!;
    expect(farmerRecord.cumulativeEvents.reactivations).toBe(1);
    expect(farmerRecord.cumulativeEvents.adaptations).toBe(1);
    expect(farmerRecord.cumulativeEvents.wipes).toBe(0);
    const attackerRecord = records.find((r) => r.persona === 'attacker')!;
    expect(attackerRecord.cumulativeEvents.wipes).toBe(1);
    expect(attackerRecord.cumulativeEvents.recoveries).toBe(1);
    expect(attackerRecord.cumulativeEvents.focusFireNominationsReceived).toBe(
      1,
    );
    const joiner = records.find((r) => r.cohortId === 'lateJoiner-30')!;
    expect(joiner.cumulativeEvents.recruitmentAwardEvents).toBe(2);
    expect(joiner.cumulativeEvents.recruitmentAwardGold).toBe(500);
    expect(joiner.cumulativeEvents.allianceAidEvents).toBe(1);
    expect(joiner.cumulativeEvents.allianceAidGold).toBe(1500);
  });

  it('excludes events after the requested day (run-to-date semantics)', () => {
    const farmer = makePlayer({ id: 'farmer-1' });
    const playerMeta = new Map<string, EraPlayerScenarioState>([
      [
        'farmer-1',
        meta('farmer-1', { persona: 'farmer', cohortId: 'primary' }),
      ],
    ]);
    const events: ScenarioEvent[] = [
      { kind: 'wipe', day: 5, actorId: 'farmer-1' },
      { kind: 'wipe', day: 50, actorId: 'farmer-1' },
    ];
    const records = collectCohortMetricsFromInput({
      players: [farmer],
      playerMeta,
      allianceMeta: new Map(),
      events,
      day: 10,
    });
    expect(records[0]!.cumulativeEvents.wipes).toBe(1);
  });

  it('produces deterministic output: same inputs -> identical records', () => {
    const farmer = makePlayer({ id: 'farmer-1', level: 3 });
    const playerMeta = new Map<string, EraPlayerScenarioState>([
      [
        'farmer-1',
        meta('farmer-1', { persona: 'farmer', cohortId: 'primary' }),
      ],
    ]);
    const events: ScenarioEvent[] = [
      { kind: 'wipe', day: 5, actorId: 'farmer-1' },
      { kind: 'recovery', day: 6, actorId: 'farmer-1' },
    ];
    const a = collectCohortMetricsFromInput({
      players: [farmer],
      playerMeta,
      allianceMeta: new Map(),
      events,
      day: 7,
    });
    const b = collectCohortMetricsFromInput({
      players: [farmer],
      playerMeta,
      allianceMeta: new Map(),
      events,
      day: 7,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('exposes fort/turns/stamina/pressure quantile fields on every record', () => {
    const p = makePlayer({
      id: 'p1',
      fortLevel: 3,
      fortHp: 120,
      attackTurns: 25,
      stamina: 80,
      xp: 500,
      defensePressureToday: 4,
      spyPressureToday: 2,
    });
    const playerMeta = new Map<string, EraPlayerScenarioState>([
      ['p1', meta('p1', { persona: 'farmer', cohortId: 'primary' })],
    ]);
    const [record] = collectCohortMetricsFromInput({
      players: [p],
      playerMeta,
      allianceMeta: new Map(),
      events: [],
      day: 0,
    });
    expect(record).toBeDefined();
    expect(record.fortLevel).toEqual({ p05: 3, median: 3, p95: 3 });
    expect(record.fortHp.median).toBe(120);
    expect(record.attackTurns.median).toBe(25);
    expect(record.stamina.median).toBe(80);
    expect(record.xp.median).toBe(500);
    expect(record.defensePressure.median).toBe(4);
    expect(record.spyPressure.median).toBe(2);
  });

  it('CohortCumulativeEvents satisfies the zero baseline contract', () => {
    const zero: CohortCumulativeEvents = ZERO_EVENTS;
    expect(zero.wipes).toBe(0);
    expect(zero.recruitmentAwardGold).toBe(0);
    const emptyRecord: Pick<CohortMetricRecord, 'cumulativeEvents'> = {
      cumulativeEvents: zero,
    };
    expect(emptyRecord.cumulativeEvents).toBe(zero);
  });
});
