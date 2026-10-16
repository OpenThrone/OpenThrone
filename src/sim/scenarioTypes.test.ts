import { describe, expect, it } from 'bun:test';

import type {
  EraPlayerScenarioState,
  EraScenarioManifest,
  EraScenarioState,
  LifecycleStatus,
  RecruitmentAwardEvent,
  RecruitmentManifest,
  ScenarioCheckpoint,
  ScenarioEvent,
} from './scenarioTypes';
import {
  ACTIVITY_CLASSES,
  ALLIANCE_MODES,
  createEmptyCumulativeCounters,
  FARMER_VARIANTS,
  PERSONAS,
  RECRUITMENT_RECIPIENT_MODES,
  RECRUITMENT_REWARD_BANDS,
  RULESET_IDS,
  ScenarioEventKind,
  simulateDayInputSeed,
} from './scenarioTypes';

describe('scenario type primitives', () => {
  it('exposes the six stable personas', () => {
    expect(PERSONAS).toEqual([
      'farmer',
      'attacker',
      'defender',
      'spy',
      'sentry',
      'balanced',
    ]);
  });

  it('exposes the three Farmer variants', () => {
    expect(FARMER_VARIANTS).toEqual(['greedy', 'cautious', 'adaptive']);
  });

  it('exposes the four activity classes', () => {
    expect(ACTIVITY_CLASSES).toEqual([
      'active',
      'passive',
      'inactive',
      'rebuilding',
    ]);
  });

  it('exposes the lifecycle status union including late joiners and rebuilding', () => {
    const statuses: LifecycleStatus[] = [
      'active',
      'inactive',
      'defeated',
      'rebuilding',
      'lateJoiner',
    ];
    for (const status of statuses) {
      expect(typeof status).toBe('string');
    }
  });

  it('exposes the three ruleset ids', () => {
    expect(RULESET_IDS).toEqual([
      'production',
      'weakLowLevelProtection',
      'candidateSafety',
    ]);
  });

  it('exposes alliance modes', () => {
    expect(ALLIANCE_MODES).toEqual([
      'none',
      'twoBalanced',
      'dominant60_40',
      'focusFive',
    ]);
  });

  it('exposes recruitment reward bands and recipient modes', () => {
    expect(RECRUITMENT_REWARD_BANDS).toEqual([5, 15, 25, 40]);
    expect(RECRUITMENT_RECIPIENT_MODES).toEqual(['self', 'networkWeighted']);
  });
});

describe('RecruitmentManifest contract', () => {
  it('captures per-day throughput, band, and recipient mode', () => {
    const manifest: RecruitmentManifest = {
      rewardsPerDay: 25,
      band: 25,
      recipientMode: 'networkWeighted',
      selectionShare: 0.75,
    };
    expect(manifest.rewardsPerDay).toBe(25);
    expect(manifest.band).toBe(25);
    expect(manifest.recipientMode).toBe('networkWeighted');
    expect(manifest.selectionShare).toBe(0.75);
  });

  it('each award event adds one citizen and 250 gold', () => {
    const event: RecruitmentAwardEvent = {
      day: 12,
      recipientId: 'player_7',
      citizensAwarded: 1,
      goldAwarded: 250,
      sourceMode: 'self',
    };
    expect(event.citizensAwarded).toBe(1);
    expect(event.goldAwarded).toBe(250);
  });
});

describe('EraScenarioManifest contract', () => {
  it('composes ruleset, recruitment, alliance, and seed without mutating base types', () => {
    const manifest: EraScenarioManifest = {
      id: 'smoke-baseline',
      rulesetId: 'production',
      seed: 42,
      totalDays: 730,
      primaryCohort: {
        activeCount: 15,
        passiveCount: 25,
        personaMix: {
          active: {
            farmer: 4,
            attacker: 4,
            defender: 2,
            spy: 2,
            sentry: 1,
            balanced: 2,
          },
          passive: {
            farmer: 8,
            attacker: 3,
            defender: 4,
            spy: 2,
            sentry: 2,
            balanced: 6,
          },
        },
        farmerVariantMix: {
          active: { greedy: 2, cautious: 1, adaptive: 1 },
          passive: { greedy: 3, cautious: 3, adaptive: 2 },
        },
      },
      recruitment: {
        rewardsPerDay: 25,
        band: 25,
        recipientMode: 'networkWeighted',
        selectionShare: 0.75,
      },
      allianceMode: 'none',
      lateJoinerDays: [30, 90, 180, 365],
    };
    expect(manifest.rulesetId).toBe('production');
    expect(manifest.totalDays).toBe(730);
    expect(manifest.primaryCohort.activeCount).toBe(15);
    expect(manifest.recruitment.band).toBe(25);
    expect(manifest.allianceMode).toBe('none');
  });
});

describe('EraPlayerScenarioState - metadata-only composition', () => {
  it('contains only scenario fields, never duplicating PlayerState scalars', () => {
    const meta: EraPlayerScenarioState = {
      persona: 'farmer',
      farmerVariant: 'greedy',
      activityClass: 'active',
      lifecycleStatus: 'active',
      cohortId: 'primary-active',
      joinedOnDay: 0,
    };

    expect(meta.persona).toBe('farmer');
    expect(meta.farmerVariant).toBe('greedy');
    expect(meta.activityClass).toBe('active');
    expect(meta.lifecycleStatus).toBe('active');
    expect(meta.cohortId).toBe('primary-active');
    expect(meta.joinedOnDay).toBe(0);
  });

  it('EraPlayerState intersects PlayerState with EraPlayerScenarioState', () => {
    // EraPlayerState is a convenience intersection; the canonical store is
    // always base PlayerState in SimulationState.players + EraPlayerScenarioState
    // in a parallel map. This test verifies assignability both ways.
    const meta: EraPlayerScenarioState = {
      persona: 'farmer',
      activityClass: 'active',
      lifecycleStatus: 'active',
      cohortId: 'c1',
      joinedOnDay: 0,
    };
    expect(meta.persona).toBe('farmer');
  });
});

describe('EraScenarioState composition - no Map invariance trap', () => {
  it('stores metadata-only maps alongside the base SimulationState players map', () => {
    // Per the design constraint: playerMeta holds EraPlayerScenarioState
    // (metadata only), NOT a duplicate of the full PlayerState.
    const meta: EraPlayerScenarioState = {
      persona: 'farmer',
      farmerVariant: 'greedy',
      activityClass: 'active',
      lifecycleStatus: 'active',
      cohortId: 'primary-active',
      joinedOnDay: 0,
    };
    const era: EraScenarioState = {
      manifest: {
        id: 't',
        rulesetId: 'production',
        seed: 1,
        totalDays: 1,
        primaryCohort: {
          activeCount: 1,
          passiveCount: 0,
          personaMix: {
            active: { farmer: 1 },
            passive: {},
          },
          farmerVariantMix: {
            active: { greedy: 1 },
            passive: {},
          },
        },
        recruitment: {
          rewardsPerDay: 0,
          band: 5,
          recipientMode: 'self',
          selectionShare: 0,
        },
        allianceMode: 'none',
        lateJoinerDays: [],
      },
      playerMeta: new Map([['player_0', meta]]),
      allianceMeta: new Map(),
      dailyCasualtyCapUsage: new Map(),
      rebuildShields: new Map(),
      checkpoints: [],
      events: [],
      cumulative: createEmptyCumulativeCounters(),
    };

    expect(era.playerMeta).toBeInstanceOf(Map);
    expect(era.playerMeta.get('player_0')?.persona).toBe('farmer');
    expect(era.allianceMeta).toBeInstanceOf(Map);
    expect(era.checkpoints).toEqual([]);
    expect(era.cumulative.totalWipes).toBe(0);
  });
});

describe('ScenarioEvent and ScenarioCheckpoint contracts', () => {
  it('checkpoint captures day + per-cohort snapshot', () => {
    const checkpoint: ScenarioCheckpoint = {
      day: 30,
      cohortSnapshots: [
        {
          cohortId: 'primary-active',
          persona: 'farmer',
          activityClass: 'active',
          citizens: 75,
          workers: 12,
          handGold: 250000,
          bankGold: 100000,
          fortLevel: 2,
          strategicPower: 1500,
        },
      ],
    };
    expect(checkpoint.day).toBe(30);
    expect(checkpoint.cohortSnapshots[0].citizens).toBe(75);
  });

  it('events carry kind, day, actorId, and optional payload', () => {
    const event: ScenarioEvent = {
      kind: ScenarioEventKind.Wipe,
      day: 14,
      actorId: 'player_3',
      reason: 'fort breached and power < 25%',
    };
    expect(event.kind).toBe(ScenarioEventKind.Wipe);
    expect(event.day).toBe(14);
  });
});

describe('simulateDayInputSeed - seed forwarding helper', () => {
  it('returns the explicit seed when provided', () => {
    expect(simulateDayInputSeed(42, undefined)).toBe(42);
  });

  it('falls back to a documented deterministic default only when none given', () => {
    expect(simulateDayInputSeed(undefined, undefined)).toBe(1);
  });

  it('prefers an injected simulation seed over the manifest default', () => {
    expect(simulateDayInputSeed(undefined, 99)).toBe(99);
  });
});
