import { describe, expect, it } from 'bun:test';

import { makeDailyDecisions } from './behaviors';
import { runSingleBattle } from './engine';
import { createPlayerState } from './population';
import { createSimPlayer } from './presets';
import { evaluateTargets } from './targeting';
import type {
  IntelPayload,
  IntelResult,
  PlayerState,
  TargetEvaluation,
  UnitCounts,
} from './types';

type CombatShape = {
  name: string;
  attackerOffense: number;
  defenderDefense: number;
};

type IntelState = 'fresh' | 'decaying' | 'expired' | 'none';

const TARGETING_SHAPES: CombatShape[] = [
  { name: 'equal power', attackerOffense: 120, defenderDefense: 100 },
  { name: 'attacker edge', attackerOffense: 140, defenderDefense: 90 },
  { name: 'defender edge', attackerOffense: 100, defenderDefense: 130 },
];

const INTEL_STATES: IntelState[] = ['fresh', 'decaying', 'expired', 'none'];

function seededRandom(seed: number): () => number {
  let value = Math.abs(Math.floor(seed)) || 1;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function makeUnits(overrides: Partial<UnitCounts>): Partial<UnitCounts> {
  return {
    citizen: 1000,
    worker: 300,
    ...overrides,
  };
}

function makeBattlePlayer(params: {
  id: string;
  level: number;
  offense?: number;
  defense?: number;
  race?: string;
  gold?: number;
}) {
  return createSimPlayer({
    id: params.id,
    displayName: params.id,
    level: params.level,
    race: params.race ?? 'HUMAN',
    playerClass: 'FIGHTER',
    houseLevel: 2,
    gold: params.gold ?? 500000,
    units: makeUnits({
      soldier: params.offense ?? 0,
      guard: params.defense ?? 0,
    }),
    fortLevel: 3,
    fortHp: 500,
    stamina: 100,
    defensePressureToday: 0,
    bonuses: { attack: 0, defense: 0 },
  });
}

function makePopulationPlayer(params: {
  id: string;
  level: number;
  offense?: number;
  defense?: number;
  spies?: number;
  gold?: number;
  attackTurns?: number;
  stamina?: number;
}): PlayerState {
  const player = createPlayerState(params.level, 'aggressive', 42);
  player.id = params.id;
  player.displayName = params.id;
  player.gold = params.gold ?? 500000;
  player.attackTurns = params.attackTurns ?? 20;
  player.stamina = params.stamina ?? 20;
  player.behavior = {
    aggression: 0.9,
    riskTolerance: 0.8,
    activityLevel: 1,
    wealthPreference: 0.25,
    spyPreference: 0.7,
    turnStrategy: 'aggressive',
    playStyle: 'aggressive',
    primaryGoal: 'dominance',
  };
  player.units = {
    ...player.units,
    soldier: params.offense ?? 100,
    knight: 0,
    berserker: 0,
    guard: params.defense ?? 100,
    archer: 0,
    royalGuard: 0,
    spy: params.spies ?? 25,
    infiltrator: 0,
    assassin: 0,
    sentry: 10,
    sentinel: 0,
    inquisitor: 0,
    citizen: 1000,
    worker: 300,
  };
  return player;
}

function intelFor(
  defender: PlayerState,
  day: number,
  overrides: Partial<IntelPayload> = {},
): IntelResult {
  return {
    success: true,
    day,
    spiesSent: 10,
    spyCasualties: 0,
    defenderInfo: {
      units: { ...defender.units },
      fortLevel: defender.fortLevel,
      fortHp: defender.fortHp,
      fortMaxHp: defender.fortMaxHp,
      gold: defender.gold,
      defenseBonus: defender.bonuses.defense,
      spyLevel: defender.spyLevel,
      sentryLevel: defender.sentryLevel,
      ...overrides,
    },
  };
}

function intelDayForState(state: IntelState): number | undefined {
  if (state === 'fresh') return 9;
  if (state === 'decaying') return 7;
  if (state === 'expired') return 6;
  return undefined;
}

function evaluateTargetShape(
  shape: CombatShape,
  intelState: IntelState,
): TargetEvaluation {
  const attacker = makePopulationPlayer({
    id: 'attacker',
    level: 10,
    offense: shape.attackerOffense,
    spies: 25,
  });
  const defender = makePopulationPlayer({
    id: 'defender',
    level: 10,
    defense: shape.defenderDefense,
    gold: 750000,
  });
  const intelDay = intelDayForState(intelState);
  if (intelDay != null) {
    attacker.intelCache.set(defender.id, intelFor(defender, intelDay));
  }

  const [target] = evaluateTargets(
    attacker,
    [attacker, defender],
    attacker.intelCache,
    5,
    10,
  );

  return target;
}

describe('v5 combat simulator battle envelopes', () => {
  it('same-level equal offense vs defense resolves without exceeding v5 turn cap', async () => {
    const result = await runSingleBattle(
      makeBattlePlayer({ id: 'attacker', level: 10, offense: 100 }),
      makeBattlePlayer({ id: 'defender', level: 10, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );

    expect(result.winner).toBe('attacker');
    expect(result.turns).toBeLessThanOrEqual(10);
    expect(result.attackerXp).toBeGreaterThan(0);
    expect(result.defenderXp).toBeGreaterThan(0);
    expect(result.attackerCasualties.soldier).toBeLessThan(100);
    expect(result.defenderCasualties.guard).toBeLessThan(100);
  });

  it('same-level slight attacker advantage produces a cleaner attack win', async () => {
    const equal = await runSingleBattle(
      makeBattlePlayer({ id: 'equal-attacker', level: 10, offense: 100 }),
      makeBattlePlayer({ id: 'equal-defender', level: 10, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );
    const advantaged = await runSingleBattle(
      makeBattlePlayer({ id: 'adv-attacker', level: 10, offense: 112 }),
      makeBattlePlayer({ id: 'adv-defender', level: 10, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );

    expect(advantaged.winner).toBe('attacker');
    expect(advantaged.attackerCasualties.soldier).toBeLessThan(
      equal.attackerCasualties.soldier,
    );
    expect(advantaged.defenderCasualties.guard).toBeGreaterThan(
      equal.defenderCasualties.guard,
    );
  });

  it('same-level slight defender advantage can stop the attack', async () => {
    const result = await runSingleBattle(
      makeBattlePlayer({ id: 'attacker', level: 10, offense: 100 }),
      makeBattlePlayer({ id: 'defender', level: 10, defense: 120 }),
      { maxTurns: 10, random: seededRandom(42) },
    );

    expect(result.winner).toBe('defender');
    expect(result.attackerCasualties.soldier).toBeGreaterThan(50);
    expect(result.defenderCasualties.guard).toBeLessThan(10);
  });

  it('attacking 2 levels down wins but pays poor XP compared with same-level combat', async () => {
    const sameLevel = await runSingleBattle(
      makeBattlePlayer({ id: 'same-attacker', level: 10, offense: 100 }),
      makeBattlePlayer({ id: 'same-defender', level: 10, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );
    const punchingDown = await runSingleBattle(
      makeBattlePlayer({ id: 'down-attacker', level: 12, offense: 100 }),
      makeBattlePlayer({ id: 'down-defender', level: 10, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );

    expect(punchingDown.winner).toBe('attacker');
    expect(punchingDown.attackerXp).toBeLessThan(sameLevel.attackerXp);
  });

  it('attacking 2 levels up pays better XP than punching down', async () => {
    const punchingDown = await runSingleBattle(
      makeBattlePlayer({ id: 'down-attacker', level: 12, offense: 100 }),
      makeBattlePlayer({ id: 'down-defender', level: 10, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );
    const punchingUp = await runSingleBattle(
      makeBattlePlayer({ id: 'up-attacker', level: 10, offense: 100 }),
      makeBattlePlayer({ id: 'up-defender', level: 12, defense: 100 }),
      { maxTurns: 10, random: seededRandom(42) },
    );

    expect(punchingUp.winner).toBe('attacker');
    expect(punchingUp.attackerXp).toBeGreaterThan(punchingDown.attackerXp);
  });

  for (const levelDelta of [1, 3]) {
    it(`attacking ${levelDelta} level(s) down suppresses XP compared with same-level combat`, async () => {
      const sameLevel = await runSingleBattle(
        makeBattlePlayer({ id: 'same-attacker', level: 10, offense: 100 }),
        makeBattlePlayer({ id: 'same-defender', level: 10, defense: 100 }),
        { maxTurns: 10, random: seededRandom(42) },
      );
      const punchingDown = await runSingleBattle(
        makeBattlePlayer({
          id: 'down-attacker',
          level: 10 + levelDelta,
          offense: 100,
        }),
        makeBattlePlayer({ id: 'down-defender', level: 10, defense: 100 }),
        { maxTurns: 10, random: seededRandom(42) },
      );

      expect(punchingDown.winner).toBe('attacker');
      expect(punchingDown.attackerXp).toBeLessThan(sameLevel.attackerXp);
    });

    it(`attacking ${levelDelta} level(s) up improves XP compared with same-level combat`, async () => {
      const sameLevel = await runSingleBattle(
        makeBattlePlayer({ id: 'same-attacker', level: 10, offense: 100 }),
        makeBattlePlayer({ id: 'same-defender', level: 10, defense: 100 }),
        { maxTurns: 10, random: seededRandom(42) },
      );
      const punchingUp = await runSingleBattle(
        makeBattlePlayer({ id: 'up-attacker', level: 10, offense: 100 }),
        makeBattlePlayer({
          id: 'up-defender',
          level: 10 + levelDelta,
          defense: 100,
        }),
        { maxTurns: 10, random: seededRandom(42) },
      );

      expect(punchingUp.winner).toBe('attacker');
      expect(punchingUp.attackerXp).toBeGreaterThan(sameLevel.attackerXp);
    });
  }

  it('slight defender advantage still matters when defender is 2 levels higher', async () => {
    const result = await runSingleBattle(
      makeBattlePlayer({ id: 'attacker', level: 10, offense: 100 }),
      makeBattlePlayer({ id: 'defender', level: 12, defense: 120 }),
      { maxTurns: 10, random: seededRandom(42) },
    );

    expect(result.winner).toBe('defender');
    expect(result.attackerXp).toBeGreaterThan(1000);
  });

  it('goblin raiders earn a small pillage edge without changing the whole outcome', async () => {
    const human = await runSingleBattle(
      makeBattlePlayer({
        id: 'human-attacker',
        level: 10,
        offense: 120,
        race: 'HUMAN',
      }),
      makeBattlePlayer({ id: 'human-defender', level: 10, defense: 100 }),
      { maxTurns: 3, random: seededRandom(42) },
    );
    const goblin = await runSingleBattle(
      makeBattlePlayer({
        id: 'goblin-attacker',
        level: 10,
        offense: 120,
        race: 'GOBLIN',
      }),
      makeBattlePlayer({ id: 'goblin-defender', level: 10, defense: 100 }),
      { maxTurns: 3, random: seededRandom(42) },
    );

    expect(human.winner).toBe('attacker');
    expect(goblin.winner).toBe('attacker');
    expect(goblin.loot).toBeGreaterThan(human.loot);
  });
});

describe('v5 intel freshness and target behavior', () => {
  for (const shape of TARGETING_SHAPES) {
    for (const intelState of INTEL_STATES) {
      it(`${intelState} intel influences ${shape.name} target evaluation`, () => {
        const target = evaluateTargetShape(shape, intelState);

        expect(target.playerId).toBe('defender');
        expect(target.intelFreshness).toBe(intelState);

        if (intelState === 'fresh' || intelState === 'decaying') {
          expect(target.intelAvailable).toBe(true);
          expect(target.shouldScout).toBe(false);
          expect(target.riskLevel).toBe('medium');
          expect(target.recommendedTurns).toBeGreaterThanOrEqual(7);
        } else {
          expect(target.intelAvailable).toBe(false);
          expect(target.shouldScout).toBe(true);
          expect(target.riskLevel).toBe('unknown');
          expect(target.recommendedTurns).toBe(3);
        }
      });
    }

    it(`decaying intel reduces confidence for ${shape.name} compared with fresh intel`, () => {
      const fresh = evaluateTargetShape(shape, 'fresh');
      const decaying = evaluateTargetShape(shape, 'decaying');

      expect(decaying.estimatedWinRate).toBeLessThan(fresh.estimatedWinRate);
      expect(decaying.priority).toBeLessThan(fresh.priority);
    });

    it(`expired intel falls back to the same estimate as no intel for ${shape.name}`, () => {
      const expired = evaluateTargetShape(shape, 'expired');
      const none = evaluateTargetShape(shape, 'none');

      expect(expired.intelAvailable).toBe(false);
      expect(expired.estimatedWinRate).toBe(none.estimatedWinRate);
      expect(expired.recommendedTurns).toBe(none.recommendedTurns);
    });
  }

  it('uses fresh intel as actionable target knowledge', () => {
    const attacker = makePopulationPlayer({
      id: 'attacker',
      level: 10,
      offense: 120,
      spies: 25,
    });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 10,
      defense: 100,
      gold: 750000,
    });
    attacker.intelCache.set(defender.id, intelFor(defender, 9));

    const [target] = evaluateTargets(
      attacker,
      [attacker, defender],
      attacker.intelCache,
      5,
      10,
    );

    expect(target.playerId).toBe(defender.id);
    expect(target.intelAvailable).toBe(true);
    expect(target.intelFreshness).toBe('fresh');
    expect(target.intelAge).toBe(1);
    expect(target.recommendedTurns).toBeGreaterThanOrEqual(7);
  });

  it('keeps decaying intel usable but less confident than fresh intel', () => {
    const attacker = makePopulationPlayer({
      id: 'attacker',
      level: 10,
      offense: 120,
      spies: 25,
    });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 10,
      defense: 100,
      gold: 750000,
    });

    const freshCache = new Map([[defender.id, intelFor(defender, 9)]]);
    const decayingCache = new Map([[defender.id, intelFor(defender, 7)]]);
    const [fresh] = evaluateTargets(
      attacker,
      [attacker, defender],
      freshCache,
      5,
      10,
    );
    const [decaying] = evaluateTargets(
      attacker,
      [attacker, defender],
      decayingCache,
      5,
      10,
    );

    expect(decaying.intelAvailable).toBe(true);
    expect(decaying.intelFreshness).toBe('decaying');
    expect(decaying.intelAge).toBe(3);
    expect(decaying.estimatedWinRate).toBeLessThan(fresh.estimatedWinRate);
  });

  it('expires old intel and asks the agent to scout again', () => {
    const attacker = makePopulationPlayer({
      id: 'attacker',
      level: 10,
      offense: 120,
      spies: 25,
    });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 10,
      defense: 100,
      gold: 750000,
    });
    attacker.intelCache.set(defender.id, intelFor(defender, 6));

    const [target] = evaluateTargets(
      attacker,
      [attacker, defender],
      attacker.intelCache,
      5,
      10,
    );

    expect(target.intelAvailable).toBe(false);
    expect(target.intelFreshness).toBe('expired');
    expect(target.shouldScout).toBe(true);
  });

  it('treats non-existent intel as unknown and scoutable for valuable targets', () => {
    const attacker = makePopulationPlayer({
      id: 'attacker',
      level: 10,
      offense: 120,
      spies: 25,
    });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 10,
      defense: 100,
      gold: 750000,
    });

    const [target] = evaluateTargets(
      attacker,
      [attacker, defender],
      attacker.intelCache,
      5,
      10,
    );

    expect(target.intelAvailable).toBe(false);
    expect(target.intelFreshness).toBe('none');
    expect(target.riskLevel).toBe('unknown');
    expect(target.shouldScout).toBe(true);
  });
});

describe('v5 follow-up attack behavior', () => {
  for (const shape of TARGETING_SHAPES) {
    it(`follow-up attack is planned after a profitable ${shape.name} win`, () => {
      const attacker = makePopulationPlayer({
        id: 'attacker',
        level: 10,
        offense: shape.attackerOffense,
        attackTurns: 20,
        stamina: 20,
      });
      const defender = makePopulationPlayer({
        id: 'defender',
        level: 10,
        defense: shape.defenderDefense,
        gold: 900000,
      });
      attacker.targetMemory.set(defender.id, {
        attacks: 1,
        wins: 1,
        lastLoot: 100000,
        lastAttackTick: 1,
      });

      const decision = makeDailyDecisions(attacker, [attacker, defender], {
        attackLevelRange: 5,
        currentDay: 2,
        random: () => 0,
      });

      expect(decision.attacks.length).toBeGreaterThan(0);
      expect(decision.attacks[0].target).toBe(defender.id);
      expect(decision.attacks[0].turns).toBeGreaterThan(1);
      expect(decision.attacks[0].turns).toBeLessThanOrEqual(10);
      expect(decision.attacks[0].reason).toContain('repeat-farm');
    });
  }

  for (const shape of TARGETING_SHAPES) {
    it(`fresh intel supports a committed follow-up for ${shape.name}`, () => {
      const attacker = makePopulationPlayer({
        id: 'attacker',
        level: 10,
        offense: shape.attackerOffense,
        attackTurns: 20,
        stamina: 20,
      });
      const defender = makePopulationPlayer({
        id: 'defender',
        level: 10,
        defense: shape.defenderDefense,
        gold: 900000,
      });
      attacker.intelCache.set(defender.id, intelFor(defender, 1));
      attacker.targetMemory.set(defender.id, {
        attacks: 1,
        wins: 1,
        lastLoot: 100000,
        lastAttackTick: 1,
      });

      const decision = makeDailyDecisions(attacker, [attacker, defender], {
        attackLevelRange: 5,
        currentDay: 2,
        random: () => 0,
      });

      expect(decision.attacks.length).toBeGreaterThan(0);
      expect(decision.attacks[0].turns).toBeGreaterThanOrEqual(7);
      expect(decision.attacks[0].turns).toBeLessThanOrEqual(10);
    });
  }

  for (const shape of TARGETING_SHAPES) {
    it(`expired intel does not block repeat-farm follow-up for ${shape.name}`, () => {
      const attacker = makePopulationPlayer({
        id: 'attacker',
        level: 10,
        offense: shape.attackerOffense,
        attackTurns: 20,
        stamina: 20,
      });
      const defender = makePopulationPlayer({
        id: 'defender',
        level: 10,
        defense: shape.defenderDefense,
        gold: 900000,
      });
      attacker.intelCache.set(defender.id, intelFor(defender, 1));
      attacker.targetMemory.set(defender.id, {
        attacks: 1,
        wins: 1,
        lastLoot: 100000,
        lastAttackTick: 1,
      });

      const decision = makeDailyDecisions(attacker, [attacker, defender], {
        attackLevelRange: 5,
        currentDay: 6,
        random: () => 0,
      });

      expect(decision.attacks.length).toBeGreaterThan(0);
      expect(decision.attacks[0].reason).toContain('repeat-farm');
    });
  }

  it('prioritizes profitable follow-up attacks against a previously farmed target', () => {
    const attacker = makePopulationPlayer({
      id: 'attacker',
      level: 10,
      offense: 140,
      attackTurns: 20,
      stamina: 20,
    });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 10,
      defense: 90,
      gold: 900000,
    });
    attacker.targetMemory.set(defender.id, {
      attacks: 1,
      wins: 1,
      lastLoot: 100000,
      lastAttackTick: 1,
    });

    const decision = makeDailyDecisions(attacker, [attacker, defender], {
      attackLevelRange: 5,
      currentDay: 2,
      random: () => 0,
    });

    expect(decision.attacks.length).toBeGreaterThan(0);
    expect(decision.attacks[0].target).toBe(defender.id);
    expect(decision.attacks[0].turns).toBeGreaterThan(1);
    expect(decision.attacks[0].turns).toBeLessThanOrEqual(10);
  });

  it('escalates after a successful 1-turn probe when the target remains valuable', async () => {
    const probe = await runSingleBattle(
      makeBattlePlayer({ id: 'probe-attacker', level: 10, offense: 160 }),
      makeBattlePlayer({
        id: 'probe-defender',
        level: 10,
        defense: 80,
        gold: 900000,
      }),
      { maxTurns: 1, random: seededRandom(99) },
    );
    expect(probe.winner).toBe('attacker');

    const attacker = makePopulationPlayer({
      id: 'attacker',
      level: 10,
      offense: 160,
      attackTurns: 20,
      stamina: 20,
    });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 10,
      defense: 80,
      gold: 900000,
    });
    attacker.targetMemory.set(defender.id, {
      attacks: 1,
      wins: 1,
      lastLoot: Math.max(50000, probe.loot),
      lastAttackTick: 1,
    });

    const decision = makeDailyDecisions(attacker, [attacker, defender], {
      attackLevelRange: 5,
      currentDay: 2,
      random: () => 0,
    });

    expect(decision.attacks.length).toBeGreaterThan(0);
    expect(decision.attacks[0].turns).toBeGreaterThan(1);
    expect(decision.attacks[0].reason).toContain('repeat-farm');
  });

  it('does not target players outside the v5 level attack range', () => {
    const attacker = makePopulationPlayer({ id: 'attacker', level: 10 });
    const defender = makePopulationPlayer({
      id: 'defender',
      level: 16,
      gold: 1000000,
    });

    const targets = evaluateTargets(
      attacker,
      [attacker, defender],
      attacker.intelCache,
      5,
      1,
    );

    expect(targets).toHaveLength(0);
  });
});
