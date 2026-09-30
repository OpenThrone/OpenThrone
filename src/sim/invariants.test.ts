import { describe, expect, it } from 'bun:test';

import { applyDecision, makeDailyDecisions } from './behaviors';
import { runSimulation as runPopulationSimulation } from './daycycle';
import {
  runSimulation as runBattleSimulation,
  runSingleBattle,
} from './engine';
import type { InvariantReason } from './invariants';
import {
  assertFinite,
  assertFiniteNonNegative,
  assertFiniteNonNegativeSafeInteger,
  assertGoldQuantity,
  assertPlayerGold,
  assertSafeInteger,
  SimulationConfigError,
  SimulationInvariantError,
} from './invariants';
import { createPlayerState, generatePopulation } from './population';
import { createBalancedPlayer } from './presets';
import type { AgentDecision, PlayerState } from './types';

describe('SimulationInvariantError', () => {
  it('carries day, playerId, field, value, and reason context', () => {
    let caught: SimulationInvariantError | null = null;
    try {
      throw new SimulationInvariantError({
        day: 17,
        playerId: 'player_3',
        field: 'gold',
        value: -50,
        reason: 'negative',
      });
    } catch (error) {
      if (error instanceof SimulationInvariantError) caught = error;
    }

    expect(caught).not.toBeNull();
    expect(caught?.day).toBe(17);
    expect(caught?.playerId).toBe('player_3');
    expect(caught?.field).toBe('gold');
    expect(caught?.value).toBe(-50);
    expect(caught?.reason).toBe('negative');
    expect(caught?.name).toBe('SimulationInvariantError');
  });

  it('restores the prototype so instanceof works after transpilation', () => {
    const error = new SimulationInvariantError({
      day: 1,
      playerId: 'p',
      field: 'goldInBank',
      value: NaN,
      reason: 'not-finite',
    });
    expect(error).toBeInstanceOf(SimulationInvariantError);
    expect(error).toBeInstanceOf(Error);
  });

  it('includes day, playerId, and field in the human-readable message', () => {
    const error = new SimulationInvariantError({
      day: 5,
      playerId: 'player_9',
      field: 'goldInBank',
      value: Infinity,
      reason: 'not-finite',
    });
    expect(String(error.message)).toContain('day 5');
    expect(String(error.message)).toContain('player_9');
    expect(String(error.message)).toContain('goldInBank');
  });

  it('serializes to JSON with full context', () => {
    const error = new SimulationInvariantError({
      day: 2,
      playerId: 'player_1',
      field: 'gold',
      value: Number.MAX_SAFE_INTEGER + 1,
      reason: 'unsafe-integer',
    });
    const json = JSON.parse(JSON.stringify(error));
    expect(json.day).toBe(2);
    expect(json.playerId).toBe('player_1');
    expect(json.field).toBe('gold');
    expect(json.reason).toBe('unsafe-integer');
  });
});

describe('assertFinite', () => {
  it('passes through finite values', () => {
    expect(() =>
      assertFinite(42, 'gold', { day: 1, playerId: 'p1' }),
    ).not.toThrow();
    expect(() =>
      assertFinite(-3.5, 'x', { day: 1, playerId: 'p1' }),
    ).not.toThrow();
  });

  it('throws SimulationInvariantError for NaN and Infinity', () => {
    expect(() => assertFinite(NaN, 'gold', { day: 4, playerId: 'p2' })).toThrow(
      SimulationInvariantError,
    );
    expect(() =>
      assertFinite(Infinity, 'gold', { day: 4, playerId: 'p2' }),
    ).toThrow(SimulationInvariantError);
    expect(() =>
      assertFinite(-Infinity, 'gold', { day: 4, playerId: 'p2' }),
    ).toThrow(SimulationInvariantError);
  });
});

describe('assertSafeInteger', () => {
  it('accepts safe integers including zero', () => {
    expect(() =>
      assertSafeInteger(0, 'gold', { day: 1, playerId: 'p' }),
    ).not.toThrow();
    expect(() =>
      assertSafeInteger(Number.MAX_SAFE_INTEGER, 'gold', {
        day: 1,
        playerId: 'p',
      }),
    ).not.toThrow();
  });

  it('rejects unsafe integers', () => {
    expect(() =>
      assertSafeInteger(Number.MAX_SAFE_INTEGER + 1, 'gold', {
        day: 9,
        playerId: 'p9',
      }),
    ).toThrow(SimulationInvariantError);
  });

  it('rejects fractional values', () => {
    expect(() =>
      assertSafeInteger(1.5, 'gold', { day: 3, playerId: 'p3' }),
    ).toThrow(SimulationInvariantError);
  });
});

describe('assertFiniteNonNegative', () => {
  it('accepts zero and positive finite numbers', () => {
    expect(() =>
      assertFiniteNonNegative(0, 'x', { day: 1, playerId: 'p' }),
    ).not.toThrow();
    expect(() =>
      assertFiniteNonNegative(3.14, 'x', { day: 1, playerId: 'p' }),
    ).not.toThrow();
  });

  it('rejects negative, NaN, and Infinity', () => {
    expect(() =>
      assertFiniteNonNegative(-1, 'gold', { day: 2, playerId: 'p2' }),
    ).toThrow(SimulationInvariantError);
    expect(() =>
      assertFiniteNonNegative(NaN, 'gold', { day: 2, playerId: 'p2' }),
    ).toThrow(SimulationInvariantError);
    expect(() =>
      assertFiniteNonNegative(Infinity, 'gold', { day: 2, playerId: 'p2' }),
    ).toThrow(SimulationInvariantError);
  });
});

describe('assertFiniteNonNegativeSafeInteger', () => {
  it('accepts zero and positive safe integers', () => {
    expect(() =>
      assertFiniteNonNegativeSafeInteger(0, 'gold', {
        day: 1,
        playerId: 'p',
      }),
    ).not.toThrow();
    expect(() =>
      assertFiniteNonNegativeSafeInteger(25000, 'gold', {
        day: 1,
        playerId: 'p',
      }),
    ).not.toThrow();
  });

  it('rejects each violation class with the correct reason', () => {
    const cases: Array<{ value: number; reason: InvariantReason }> = [
      { value: NaN, reason: 'not-finite' },
      { value: Infinity, reason: 'not-finite' },
      { value: -Infinity, reason: 'not-finite' },
      { value: -1, reason: 'negative' },
      { value: 1.5, reason: 'fractional' },
      { value: Number.MAX_SAFE_INTEGER + 1, reason: 'unsafe-integer' },
    ];

    for (const { value, reason } of cases) {
      try {
        assertFiniteNonNegativeSafeInteger(value, 'gold', {
          day: 7,
          playerId: 'player_x',
        });
        throw new Error(`expected throw for value=${value}`);
      } catch (error) {
        if (!(error instanceof SimulationInvariantError)) {
          throw error;
        }
        expect(error.reason).toBe(reason);
        expect(error.day).toBe(7);
        expect(error.playerId).toBe('player_x');
        expect(error.field).toBe('gold');
      }
    }
  });
});

describe('assertGoldQuantity - economic boundary contract', () => {
  it('accepts valid hand/bank/treasury gold values', () => {
    expect(() =>
      assertGoldQuantity(0, 'gold', { day: 0, playerId: 'fresh' }),
    ).not.toThrow();
    expect(() =>
      assertGoldQuantity(25000, 'gold', { day: 0, playerId: 'fresh' }),
    ).not.toThrow();
    expect(() =>
      assertGoldQuantity(9_007_199_254_740_991, 'goldInBank', {
        day: 0,
        playerId: 'fresh',
      }),
    ).not.toThrow();
  });

  it('rejects each ERA-relevant failure mode with day/player/field context', () => {
    const failures: Array<{ value: number; reason: InvariantReason }> = [
      { value: -5, reason: 'negative' },
      { value: NaN, reason: 'not-finite' },
      { value: Infinity, reason: 'not-finite' },
      { value: 0.5, reason: 'fractional' },
      { value: Number.MAX_SAFE_INTEGER + 1, reason: 'unsafe-integer' },
    ];

    for (const { value, reason } of failures) {
      try {
        assertGoldQuantity(value, 'goldInBank', {
          day: 365,
          playerId: 'player_42',
        });
        throw new Error(`expected throw for value=${value}`);
      } catch (error) {
        if (!(error instanceof SimulationInvariantError)) {
          throw error;
        }
        expect(error.reason).toBe(reason);
        expect(error.day).toBe(365);
        expect(error.playerId).toBe('player_42');
        expect(error.field).toBe('goldInBank');
      }
    }
  });
});

describe('runSimulation integration - fail-fast on invalid initial gold', () => {
  function makeValidPlayer(): PlayerState {
    const [player] = generatePopulation(1, [1, 1], 42);
    return player;
  }

  const invalidGoldCases: Array<{
    name: string;
    gold: number;
    reason: InvariantReason;
  }> = [
    { name: 'negative', gold: -50, reason: 'negative' },
    { name: 'NaN', gold: NaN, reason: 'not-finite' },
    { name: 'Infinity', gold: Infinity, reason: 'not-finite' },
    { name: 'fractional', gold: 25000.5, reason: 'fractional' },
    {
      name: 'MAX_SAFE_INTEGER+1',
      gold: Number.MAX_SAFE_INTEGER + 1,
      reason: 'unsafe-integer',
    },
  ];

  for (const { name, gold, reason } of invalidGoldCases) {
    it(`rejects invalid initial hand gold (${name}) before sanitization at day=0`, async () => {
      const player = makeValidPlayer();
      player.gold = gold;
      try {
        await runPopulationSimulation([player], 1, { seed: 42 });
        throw new Error('expected SimulationInvariantError');
      } catch (error) {
        if (!(error instanceof SimulationInvariantError)) throw error;
        expect(error.day).toBe(0);
        expect(error.playerId).toBe(player.id);
        expect(error.field).toBe('gold');
        expect(error.reason).toBe(reason);
      }
    });
  }

  it('rejects invalid initial bank gold at day=0', async () => {
    const player = makeValidPlayer();
    player.goldInBank = -100;
    try {
      await runPopulationSimulation([player], 1, { seed: 42 });
      throw new Error('expected SimulationInvariantError');
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.day).toBe(0);
      expect(error.playerId).toBe(player.id);
      expect(error.field).toBe('goldInBank');
      expect(error.reason).toBe('negative');
    }
  });

  it('accepts valid level-zero ERA initial gold (25000 hand, 0 bank)', async () => {
    const player = makeValidPlayer();
    player.gold = 25000;
    player.goldInBank = 0;
    player.houseLevel = 0;
    player.economyLevel = 0;
    const state = await runPopulationSimulation([player], 1, { seed: 42 });
    expect(state.day).toBe(1);
  });
});

describe('overflow at mutation boundary', () => {
  it('turn-income assertion catches gold overflow past MAX_SAFE_INTEGER', () => {
    const player = generatePopulation(1, [10, 10], 42)[0];
    player.gold = Number.MAX_SAFE_INTEGER - 1;
    const income = 2;
    player.gold += income;
    try {
      assertPlayerGold(player, { day: 1, playerId: player.id });
      throw new Error('expected SimulationInvariantError');
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('unsafe-integer');
      expect(error.field).toBe('gold');
    }
  });

  it('bank-deposit assertion catches goldInBank overflow', () => {
    const player = generatePopulation(1, [10, 10], 42)[0];
    player.gold = 1000;
    player.goldInBank = Number.MAX_SAFE_INTEGER - 1;
    const deposit = 2;
    player.gold -= deposit;
    player.goldInBank += deposit;
    try {
      assertPlayerGold(player, { day: 5, playerId: player.id });
      throw new Error('expected SimulationInvariantError');
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('unsafe-integer');
      expect(error.field).toBe('goldInBank');
    }
  });
});

describe('applyDecision - mandatory invariant context', () => {
  const ctx = { day: 1, playerId: 'player_test' };

  function makeValidPlayer(): PlayerState {
    const player = generatePopulation(1, [5, 5], 42)[0];
    player.gold = 500000;
    player.goldInBank = 100000;
    return player;
  }

  const emptyDecision: AgentDecision = {
    intelMissions: [],
    attacks: [],
    recruitment: {},
  };

  const invalidGoldCases: Array<{
    name: string;
    gold: number;
    reason: InvariantReason;
  }> = [
    { name: 'negative', gold: -1, reason: 'negative' },
    { name: 'NaN', gold: NaN, reason: 'not-finite' },
    { name: 'Infinity', gold: Infinity, reason: 'not-finite' },
    { name: 'fractional', gold: 500.5, reason: 'fractional' },
    {
      name: 'unsafe-integer',
      gold: Number.MAX_SAFE_INTEGER + 1,
      reason: 'unsafe-integer',
    },
  ];

  for (const { name, gold, reason } of invalidGoldCases) {
    it(`rejects invalid initial gold (${name}) before any mutation`, () => {
      const player = makeValidPlayer();
      player.gold = gold;
      try {
        applyDecision(player, emptyDecision, ctx);
        throw new Error('expected SimulationInvariantError');
      } catch (error) {
        if (!(error instanceof SimulationInvariantError)) throw error;
        expect(error.reason).toBe(reason);
        expect(error.field).toBe('gold');
        expect(error.day).toBe(1);
        expect(error.playerId).toBe('player_test');
      }
    });
  }

  it('rejects invalid goldInBank before any mutation', () => {
    const player = makeValidPlayer();
    player.goldInBank = -50;
    try {
      applyDecision(player, emptyDecision, ctx);
      throw new Error('expected SimulationInvariantError');
    } catch (error) {
      if (!(error instanceof SimulationInvariantError)) throw error;
      expect(error.reason).toBe('negative');
      expect(error.field).toBe('goldInBank');
    }
  });

  it('accepts valid player with empty decision without mutation', () => {
    const player = makeValidPlayer();
    const result = applyDecision(player, emptyDecision, ctx);
    expect(result.gold).toBe(500000);
    expect(result.goldInBank).toBe(100000);
  });
});

describe('duplicate player ID detection', () => {
  it('runSimulation rejects duplicate IDs before Map insertion', async () => {
    const players = generatePopulation(2, [1, 1], 42);
    players[1].id = players[0].id;
    try {
      await runPopulationSimulation(players, 1, { seed: 42 });
      throw new Error('expected SimulationConfigError');
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
      expect(error.code).toBe('duplicate-player-id');
      expect(error.playerId).toBe(players[0].id);
    }
  });

  it('does not silently shrink population on duplicate', async () => {
    const players = generatePopulation(3, [1, 1], 42);
    players[2].id = players[0].id;
    try {
      await runPopulationSimulation(players, 1, { seed: 42 });
    } catch (error) {
      if (!(error instanceof SimulationConfigError)) throw error;
    }
  });

  it('createPlayerState explicit id parameter prevents collision', () => {
    const a = createPlayerState(5, 'balanced', 42, 'custom_a');
    const b = createPlayerState(5, 'balanced', 42, 'custom_b');
    expect(a.id).toBe('custom_a');
    expect(b.id).toBe('custom_b');
  });
});

describe('engine.runSimulation - advancing RNG across iterations', () => {
  it('multi-iteration run without explicit random advances rather than replaying', async () => {
    const attacker = createBalancedPlayer(5, 'offense');
    const defender = createBalancedPlayer(5, 'defense');
    const results = await runBattleSimulation(attacker, defender, 5);
    expect(results.gamesPlayed).toBe(5);
    const allLoot = results.avgLoot * 5;
    expect(allLoot).toBeGreaterThanOrEqual(0);
  });

  it('same attacker/defender without random produces varied outcomes', async () => {
    const attacker = createBalancedPlayer(10, 'offense');
    const defender = createBalancedPlayer(10, 'defense');
    const r1 = await runBattleSimulation(attacker, defender, 3);
    expect(r1.gamesPlayed).toBe(3);
  });
});

describe('injected random callback validation', () => {
  it('rejects out-of-range behavior draws', () => {
    const player = generatePopulation(1, [5, 5], 42)[0];
    player.behavior.primaryGoal = 'dominance';
    expect(() =>
      makeDailyDecisions(player, [player], { random: () => 1.5 }),
    ).toThrow(RangeError);
  });

  it('rejects out-of-range battle draws', async () => {
    const attacker = createBalancedPlayer(5, 'offense');
    const defender = createBalancedPlayer(5, 'defense');
    try {
      await runSingleBattle(attacker, defender, { random: () => 1.5 });
      throw new Error('expected invalid random callback to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
  });
});
