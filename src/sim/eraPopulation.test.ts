import { describe, expect, it } from 'bun:test';

import { calculateRecruitBonus, calculateTurnIncome } from './economy';
import {
  createEraCohort,
  createEraPlayer,
  createLateJoiner,
  LATE_JOINER_DAYS,
  PRIMARY_COHORT_MANIFEST,
  scaleCohortManifest,
  validateCohortManifest,
} from './eraPopulation';
import { SimulationConfigError } from './invariants';
import {
  type ActivityClass,
  type CohortManifest,
  FARMER_VARIANTS,
  type FarmerVariant,
  type Persona,
  PERSONAS,
} from './scenarioTypes';
import type { PlayerState } from './types';

const PERSONA_BY_GROUP = (players: ReturnType<typeof createEraCohort>) => {
  const active: Record<string, number> = {};
  const passive: Record<string, number> = {};
  for (const p of players) {
    const bucket = p.activityClass === 'active' ? active : passive;
    bucket[p.persona] = (bucket[p.persona] ?? 0) + 1;
  }
  return { active, passive };
};

const FARMER_VARIANTS_BY_GROUP = (
  players: ReturnType<typeof createEraCohort>,
) => {
  const active: Record<string, number> = {};
  const passive: Record<string, number> = {};
  for (const p of players) {
    if (p.persona !== 'farmer' || !p.farmerVariant) continue;
    const bucket = p.activityClass === 'active' ? active : passive;
    bucket[p.farmerVariant] = (bucket[p.farmerVariant] ?? 0) + 1;
  }
  return { active, passive };
};

function pickScalarFields(p: PlayerState) {
  return {
    level: p.level,
    xp: p.xp,
    gold: p.gold,
    goldInBank: p.goldInBank,
    attackTurns: p.attackTurns,
    stamina: p.stamina,
    maxStamina: p.maxStamina,
    defensePressureToday: p.defensePressureToday,
    spyPressureToday: p.spyPressureToday,
    fortLevel: p.fortLevel,
    fortHp: p.fortHp,
    fortMaxHp: p.fortMaxHp,
    houseLevel: p.houseLevel,
    economyLevel: p.economyLevel,
    spyLevel: p.spyLevel,
    sentryLevel: p.sentryLevel,
    recruitBonus: p.recruitBonus,
    maximumBankDeposits: p.maximumBankDeposits,
    status: p.status,
  };
}

describe('createEraPlayer production-parity defaults', () => {
  it('matches every production scalar default exactly', () => {
    const player = createEraPlayer();
    expect(pickScalarFields(player)).toEqual({
      level: 1,
      xp: 0,
      gold: 25000,
      goldInBank: 0,
      attackTurns: 50,
      stamina: 100,
      maxStamina: 100,
      defensePressureToday: 0,
      spyPressureToday: 0,
      fortLevel: 1,
      fortHp: 50,
      fortMaxHp: 50,
      houseLevel: 0,
      economyLevel: 0,
      spyLevel: 1,
      sentryLevel: 1,
      recruitBonus: 1,
      maximumBankDeposits: 3,
      status: 'active',
    });
  });

  it('matches every unit default exactly (50 citizens, zero trained units)', () => {
    const player = createEraPlayer();
    expect(player.units).toEqual({
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
      citizen: 50,
      worker: 0,
    });
  });

  it('zeroes items, upgrades, and bonuses', () => {
    const player = createEraPlayer();
    expect(player.items).toEqual({
      meleeAtk: 0,
      meleeDef: 0,
      rangedAtk: 0,
      rangedDef: 0,
    });
    expect(player.upgrades).toEqual({ offense: 0, defense: 0 });
    expect(player.bonuses).toEqual({
      attack: 0,
      defense: 0,
      spy: 0,
      sentry: 0,
    });
  });

  it('initializes empty history maps and bank deposit log', () => {
    const player = createEraPlayer();
    expect(player.intelCache.size).toBe(0);
    expect(player.attackHistory.size).toBe(0);
    expect(player.incomingAttackHistory.size).toBe(0);
    expect(player.targetMemory.size).toBe(0);
    expect(player.bankDepositHistory).toEqual([]);
    expect(player.dailyLimits).toEqual({
      attacksUsed: 0,
      intelUsed: 0,
      assassinationUsed: 0,
      infiltrationUsed: 0,
    });
  });

  it('does not use the legacy level-clamping helpers (house/economy stay 0)', () => {
    const player = createEraPlayer();
    expect(player.houseLevel).toBe(0);
    expect(player.economyLevel).toBe(0);
    expect(player.fortLevel).toBe(1);
    expect(player.spyLevel).toBe(1);
    expect(player.sentryLevel).toBe(1);
  });

  it('defaults scenario metadata to balanced/active/primary/day-0', () => {
    const player = createEraPlayer();
    expect(player.persona).toBe('balanced');
    expect(player.farmerVariant).toBeUndefined();
    expect(player.activityClass).toBe('active');
    expect(player.lifecycleStatus).toBe('active');
    expect(player.cohortId).toBe('primary');
    expect(player.joinedOnDay).toBe(0);
  });

  it('each created player owns independent mutable copies (no shared maps)', () => {
    const a = createEraPlayer({ id: 'a' });
    const b = createEraPlayer({ id: 'b' });
    a.units.citizen = 999;
    a.intelCache.set('x', {} as never);
    expect(b.units.citizen).toBe(50);
    expect(b.intelCache.size).toBe(0);
  });
});

describe('PRIMARY_COHORT_MANIFEST', () => {
  it('declares 15 active / 25 passive', () => {
    expect(PRIMARY_COHORT_MANIFEST.activeCount).toBe(15);
    expect(PRIMARY_COHORT_MANIFEST.passiveCount).toBe(25);
  });

  it('carries the exact active persona mix (4F/4A/2D/2S/1Se/2B)', () => {
    expect(PRIMARY_COHORT_MANIFEST.personaMix.active).toEqual({
      farmer: 4,
      attacker: 4,
      defender: 2,
      spy: 2,
      sentry: 1,
      balanced: 2,
    });
  });

  it('carries the exact passive persona mix (8F/3A/4D/2S/2Se/6B)', () => {
    expect(PRIMARY_COHORT_MANIFEST.personaMix.passive).toEqual({
      farmer: 8,
      attacker: 3,
      defender: 4,
      spy: 2,
      sentry: 2,
      balanced: 6,
    });
  });

  it('carries the exact Farmer variant mix (active 2g/1c/1a, passive 3g/3c/2a)', () => {
    expect(PRIMARY_COHORT_MANIFEST.farmerVariantMix.active).toEqual({
      greedy: 2,
      cautious: 1,
      adaptive: 1,
    });
    expect(PRIMARY_COHORT_MANIFEST.farmerVariantMix.passive).toEqual({
      greedy: 3,
      cautious: 3,
      adaptive: 2,
    });
  });

  it('passes its own validator', () => {
    expect(() => validateCohortManifest(PRIMARY_COHORT_MANIFEST)).not.toThrow();
  });
});

describe('createEraCohort primary manifest', () => {
  const cohort = createEraCohort();

  it('produces exactly 40 players', () => {
    expect(cohort).toHaveLength(40);
  });

  it('matches the exact active persona counts', () => {
    const { active } = PERSONA_BY_GROUP(cohort);
    expect(active).toEqual({
      farmer: 4,
      attacker: 4,
      defender: 2,
      spy: 2,
      sentry: 1,
      balanced: 2,
    });
  });

  it('matches the exact passive persona counts', () => {
    const { passive } = PERSONA_BY_GROUP(cohort);
    expect(passive).toEqual({
      farmer: 8,
      attacker: 3,
      defender: 4,
      spy: 2,
      sentry: 2,
      balanced: 6,
    });
  });

  it('matches the exact active Farmer variant counts (2g/1c/1a)', () => {
    expect(FARMER_VARIANTS_BY_GROUP(cohort).active).toEqual({
      greedy: 2,
      cautious: 1,
      adaptive: 1,
    });
  });

  it('matches the exact passive Farmer variant counts (3g/3c/2a)', () => {
    expect(FARMER_VARIANTS_BY_GROUP(cohort).passive).toEqual({
      greedy: 3,
      cautious: 3,
      adaptive: 2,
    });
  });

  it('assigns 15 active + 25 passive activity classes', () => {
    const active = cohort.filter((p) => p.activityClass === 'active');
    const passive = cohort.filter((p) => p.activityClass === 'passive');
    expect(active).toHaveLength(15);
    expect(passive).toHaveLength(25);
  });

  it('gives every player the primary cohort id and joinedOnDay 0', () => {
    for (const p of cohort) {
      expect(p.cohortId).toBe('primary');
      expect(p.joinedOnDay).toBe(0);
      expect(p.lifecycleStatus).toBe('active');
    }
  });
});

describe('createEraCohort deterministic IDs and ordering', () => {
  it('assigns unique structural IDs across all 40 players', () => {
    const cohort = createEraCohort();
    const ids = cohort.map((p) => p.id);
    expect(new Set(ids).size).toBe(40);
  });

  it('encodes persona, Farmer variant, activity class, and index in the id', () => {
    const cohort = createEraCohort();
    const greedyActive = cohort.find(
      (p) =>
        p.activityClass === 'active' &&
        p.persona === 'farmer' &&
        p.farmerVariant === 'greedy',
    );
    expect(greedyActive?.id).toBe('primary-active-farmer-greedy-0');

    const sentryActive = cohort.find(
      (p) => p.activityClass === 'active' && p.persona === 'sentry',
    );
    expect(sentryActive?.id).toBe('primary-active-sentry-0');
  });

  it('reproduces identical ids and ordering across repeated calls (no RNG)', () => {
    const first = createEraCohort().map((p) => p.id);
    const second = createEraCohort().map((p) => p.id);
    expect(second).toEqual(first);
  });

  it('iterates personas in canonical PERSONAS order within each group', () => {
    const cohort = createEraCohort();
    const activeOrder = cohort
      .filter((p) => p.activityClass === 'active')
      .map((p) => p.persona);
    expect(activeOrder).toEqual([
      'farmer',
      'farmer',
      'farmer',
      'farmer',
      'attacker',
      'attacker',
      'attacker',
      'attacker',
      'defender',
      'defender',
      'spy',
      'spy',
      'sentry',
      'balanced',
      'balanced',
    ]);
  });
});

describe('scaleCohortManifest deterministic largest-remainder scaling', () => {
  it('scales to 10 active / 20 passive with exact totals', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 10, 20);
    expect(scaled.activeCount).toBe(10);
    expect(scaled.passiveCount).toBe(20);

    const activeSum = PERSONAS.reduce(
      (s, p) => s + (scaled.personaMix.active[p] ?? 0),
      0,
    );
    const passiveSum = PERSONAS.reduce(
      (s, p) => s + (scaled.personaMix.passive[p] ?? 0),
      0,
    );
    expect(activeSum).toBe(10);
    expect(passiveSum).toBe(20);
  });

  it('retains every persona in the 10+20 bound', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 10, 20);
    for (const persona of PERSONAS) {
      expect(scaled.personaMix.active[persona]).toBeGreaterThan(0);
      expect(scaled.personaMix.passive[persona]).toBeGreaterThan(0);
    }
  });

  it('scales to 20 active / 30 passive with exact totals', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 20, 30);
    const activeSum = PERSONAS.reduce(
      (s, p) => s + (scaled.personaMix.active[p] ?? 0),
      0,
    );
    const passiveSum = PERSONAS.reduce(
      (s, p) => s + (scaled.personaMix.passive[p] ?? 0),
      0,
    );
    expect(activeSum).toBe(20);
    expect(passiveSum).toBe(30);
  });

  it('retains every persona in the 20+30 bound', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 20, 30);
    for (const persona of PERSONAS) {
      expect(scaled.personaMix.active[persona]).toBeGreaterThan(0);
      expect(scaled.personaMix.passive[persona]).toBeGreaterThan(0);
    }
  });

  it('keeps Farmer variant counts consistent with the scaled farmer count', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 20, 30);
    for (const group of ['active', 'passive'] as const) {
      const farmerCount = scaled.personaMix[group].farmer ?? 0;
      const variantSum = FARMER_VARIANTS.reduce(
        (s, v) => s + (scaled.farmerVariantMix[group][v] ?? 0),
        0,
      );
      expect(variantSum).toBe(farmerCount);
    }
  });

  it('is deterministic: same inputs produce identical manifests', () => {
    const a = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 13, 27);
    const b = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 13, 27);
    expect(b).toEqual(a);
  });

  it('produces a scaled roster whose size equals active+passive', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 10, 20);
    const players = createEraCohort(scaled);
    expect(players).toHaveLength(30);
  });

  it('rejects bounds smaller than the persona count', () => {
    expect(() => scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 5, 25)).toThrow(
      SimulationConfigError,
    );
    expect(() => scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 15, 5)).toThrow(
      SimulationConfigError,
    );
  });
});

describe('createLateJoiner', () => {
  it('starts from fresh ERA defaults, not incumbent level scaling', () => {
    const lj = createLateJoiner(30, 'attacker');
    expect(pickScalarFields(lj)).toEqual({
      level: 1,
      xp: 0,
      gold: 25000,
      goldInBank: 0,
      attackTurns: 50,
      stamina: 100,
      maxStamina: 100,
      defensePressureToday: 0,
      spyPressureToday: 0,
      fortLevel: 1,
      fortHp: 50,
      fortMaxHp: 50,
      houseLevel: 0,
      economyLevel: 0,
      spyLevel: 1,
      sentryLevel: 1,
      recruitBonus: 1,
      maximumBankDeposits: 3,
      status: 'active',
    });
    expect(lj.units.citizen).toBe(50);
    expect(lj.units.worker).toBe(0);
  });

  it('assigns a distinct cohort id per arrival day and marks lifecycle lateJoiner', () => {
    for (const day of LATE_JOINER_DAYS) {
      const lj = createLateJoiner(day, 'balanced');
      expect(lj.cohortId).toBe(`lateJoiner-${day}`);
      expect(lj.lifecycleStatus).toBe('lateJoiner');
      expect(lj.joinedOnDay).toBe(day);
    }
    const ids = LATE_JOINER_DAYS.map((d) => `lateJoiner-${d}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('encodes the arrival day and persona in the id', () => {
    const lj = createLateJoiner(90, 'farmer', 'greedy');
    expect(lj.id).toBe('lateJoiner-90-active-farmer-greedy-0');
    expect(lj.farmerVariant).toBe('greedy');
  });

  it('exposes the standard arrival days 30/90/180/365', () => {
    expect([...LATE_JOINER_DAYS]).toEqual([30, 90, 180, 365]);
  });

  it('rejects negative or non-integer days', () => {
    expect(() => createLateJoiner(-1, 'balanced')).toThrow(
      SimulationConfigError,
    );
    expect(() => createLateJoiner(1.5, 'balanced')).toThrow(
      SimulationConfigError,
    );
  });
});

describe('validateCohortManifest failures', () => {
  it('rejects a persona mix whose total does not match activeCount', () => {
    const bad: CohortManifest = {
      activeCount: 15,
      passiveCount: 25,
      personaMix: {
        active: {
          farmer: 4,
          attacker: 4,
          defender: 2,
          spy: 2,
          sentry: 1,
          balanced: 1,
        },
        passive: PRIMARY_COHORT_MANIFEST.personaMix.passive,
      },
      farmerVariantMix: PRIMARY_COHORT_MANIFEST.farmerVariantMix,
    };
    let caught: SimulationConfigError | null = null;
    try {
      validateCohortManifest(bad);
    } catch (error) {
      if (error instanceof SimulationConfigError) caught = error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toContain('personaMix.active');
    expect(caught?.message).toContain('14');
  });

  it('rejects a missing persona with the offending field path', () => {
    const bad: CohortManifest = {
      activeCount: 14,
      passiveCount: 25,
      personaMix: {
        active: {
          farmer: 4,
          attacker: 4,
          defender: 2,
          spy: 2,
          sentry: 0,
          balanced: 2,
        },
        passive: PRIMARY_COHORT_MANIFEST.personaMix.passive,
      },
      farmerVariantMix: PRIMARY_COHORT_MANIFEST.farmerVariantMix,
    };
    let caught: SimulationConfigError | null = null;
    try {
      validateCohortManifest(bad);
    } catch (error) {
      if (error instanceof SimulationConfigError) caught = error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toContain('personaMix.active.sentry');
  });

  it('rejects Farmer variant counts that do not sum to the farmer total', () => {
    const bad: CohortManifest = {
      activeCount: 15,
      passiveCount: 25,
      personaMix: PRIMARY_COHORT_MANIFEST.personaMix,
      farmerVariantMix: {
        active: { greedy: 2, cautious: 1, adaptive: 0 },
        passive: PRIMARY_COHORT_MANIFEST.farmerVariantMix.passive,
      },
    };
    expect(() => validateCohortManifest(bad)).toThrow(SimulationConfigError);
  });

  it('createEraCohort re-validates by default and throws on a bad manifest', () => {
    const bad: CohortManifest = {
      activeCount: 15,
      passiveCount: 25,
      personaMix: {
        active: {
          farmer: 4,
          attacker: 4,
          defender: 2,
          spy: 2,
          sentry: 1,
          balanced: 1,
        },
        passive: PRIMARY_COHORT_MANIFEST.personaMix.passive,
      },
      farmerVariantMix: PRIMARY_COHORT_MANIFEST.farmerVariantMix,
    };
    expect(() => createEraCohort(bad)).toThrow(SimulationConfigError);
  });
});

describe('golden day-1 fixture (48-tick / no-action economy)', () => {
  // 1440 minutes/day / 30-minute turn interval = 48 ticks/day.
  const TICKS_PER_DAY = 48;

  it('ends day 1 with 51 citizens, 73000 hand gold, 98 turns', () => {
    const player = createEraPlayer({ id: 'golden-day-1', persona: 'balanced' });

    // Daily reset: grant recruitBonus citizens once per day.
    // calculateRecruitBonus = max(1, floor(recruitBonus || GRANT)) = 1.
    const dailyGrant = calculateRecruitBonus(player);
    expect(dailyGrant).toBe(1);
    player.units.citizen += dailyGrant;

    // 48 turn ticks: each adds calculateTurnIncome gold and 1 attack turn.
    // fort level 1 (Manor) goldPerTurn=1000; 0 workers => 1000/tick.
    expect(calculateTurnIncome(player)).toBe(1000);

    let totalIncome = 0;
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      const income = calculateTurnIncome(player);
      player.gold += income;
      player.attackTurns += 1;
      totalIncome += income;
    }

    expect(totalIncome).toBe(48000);
    expect(player.units.citizen).toBe(51);
    expect(player.gold).toBe(73000);
    expect(player.attackTurns).toBe(98);
  });

  it('keeps bank gold at 0 with no deposits', () => {
    const player = createEraPlayer({ id: 'golden-no-bank' });
    player.units.citizen += calculateRecruitBonus(player);
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      player.gold += calculateTurnIncome(player);
    }
    expect(player.goldInBank).toBe(0);
  });

  it('is reproducible: a second fresh player reaches the same end state', () => {
    function runOnce(): { citizens: number; gold: number; turns: number } {
      const p = createEraPlayer({ id: 'golden-repro' });
      p.units.citizen += calculateRecruitBonus(p);
      for (let i = 0; i < TICKS_PER_DAY; i++) {
        p.gold += calculateTurnIncome(p);
        p.attackTurns += 1;
      }
      return {
        citizens: p.units.citizen,
        gold: p.gold,
        turns: p.attackTurns,
      };
    }
    expect(runOnce()).toEqual(runOnce());
  });
});

describe('createEraCohort with explicit cohort id', () => {
  it('propagates the cohort id to every player id and metadata field', () => {
    const cohort = createEraCohort(PRIMARY_COHORT_MANIFEST, {
      cohortId: 'stress-A',
    });
    expect(cohort.every((p) => p.cohortId === 'stress-A')).toBe(true);
    expect(cohort.every((p) => p.id.startsWith('stress-A-'))).toBe(true);
    const ids = cohort.map((p) => p.id);
    expect(new Set(ids).size).toBe(40);
  });
});

describe('createEraCohort scenario metadata coverage', () => {
  it('every persona/variant/activity combination carries correct metadata', () => {
    const cohort = createEraCohort();
    for (const p of cohort) {
      expect(PERSONAS).toContain(p.persona);
      expect(['active', 'passive']).toContain(p.activityClass);
      if (p.persona === 'farmer' && p.farmerVariant) {
        expect(FARMER_VARIANTS).toContain(p.farmerVariant);
      } else {
        expect(p.farmerVariant).toBeUndefined();
      }
    }
  });

  it('uses only the canonical PERSONAS and FARMER_VARIANTS enumerations', () => {
    const cohort = createEraCohort();
    const personas = new Set(cohort.map((p) => p.persona));
    expect(personas.size).toBe(PERSONAS.length);
    expect(PERSONAS.every((persona) => personas.has(persona))).toBe(true);
    const variants = new Set(
      cohort
        .filter((p) => p.persona === 'farmer')
        .map((p) => p.farmerVariant as FarmerVariant),
    );
    expect(variants.size).toBe(FARMER_VARIANTS.length);
    expect(FARMER_VARIANTS.every((v) => variants.has(v))).toBe(true);
  });
});

describe('scaled cohort id uniqueness', () => {
  it('10+20 scaled roster has 30 unique ids and retains all personas', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 10, 20);
    const players = createEraCohort(scaled, { cohortId: 'scaled-10-20' });
    const ids = players.map((p) => p.id);
    expect(new Set(ids).size).toBe(30);
    const personasActive = new Set(
      players
        .filter((p) => p.activityClass === 'active')
        .map((p) => p.persona as Persona),
    );
    expect(personasActive.size).toBe(PERSONAS.length);
    expect(PERSONAS.every((persona) => personasActive.has(persona))).toBe(true);
  });

  it('20+30 scaled roster has 50 unique ids', () => {
    const scaled = scaleCohortManifest(PRIMARY_COHORT_MANIFEST, 20, 30);
    const players = createEraCohort(scaled, { cohortId: 'scaled-20-30' });
    const ids = players.map((p) => p.id);
    expect(new Set(ids).size).toBe(50);
    const activityCounts = players.reduce(
      (acc, p) => {
        acc[p.activityClass as ActivityClass] += 1;
        return acc;
      },
      { active: 0, passive: 0 } as Record<string, number>,
    );
    expect(activityCounts.active).toBe(20);
    expect(activityCounts.passive).toBe(30);
  });
});
