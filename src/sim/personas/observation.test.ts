import { describe, expect, it } from 'bun:test';

import { createPlayerState } from '../population';
import { createRng } from '../random';
import type { PlayerState } from '../types';
import { makeObservation, makeQuietFarmerSelf, makeTactical } from './fixtures';
import { buildPersonaObservation, EMPTY_THREAT_SIGNALS } from './observation';
import { createInitialTacticalState, decidePersonaPolicy } from './policy';

function makeOpponent(id: string, gold: number, guards: number): PlayerState {
  const player = createPlayerState(10, 'balanced', 1, id);
  player.gold = gold;
  player.goldInBank = 0;
  player.units = { ...player.units, guard: guards, citizen: 0, worker: 0 };
  player.status = 'active';
  return player;
}

const SELF_PLAYER = createPlayerState(10, 'balanced', 7, 'farmer-self');
SELF_PLAYER.gold = 2_000_000;
SELF_PLAYER.units = { ...SELF_PLAYER.units, citizen: 500, worker: 1000 };

const BUILD_OPTS = {
  day: 12,
  tick: 0,
  ticksPerDay: 48,
  attackLevelRange: 5,
  currentDay: 12,
  expectedRemainingTicks: 48 * 300,
  signals: EMPTY_THREAT_SIGNALS,
  coverageFraction: 0.9,
};

describe('buildPersonaObservation imperfect-information projection', () => {
  it('drops exact opponent gold/units/hp - no hidden-data channel exists', () => {
    const opp = makeOpponent('opp', 543_219, 317);
    const obs = buildPersonaObservation(
      SELF_PLAYER,
      [opp],
      'farmer',
      'greedy',
      'active',
      BUILD_OPTS,
    );
    const target = obs.targets[0];
    const targetKeys = Object.keys(target);

    expect(targetKeys).not.toContain('gold');
    expect(targetKeys).not.toContain('units');
    expect(targetKeys).not.toContain('fortHp');
    expect(targetKeys).not.toContain('fortMaxHp');
    expect(target.goldBand).toBe('rich');
    expect(target.powerBand).not.toBe('unknown');
    expect(typeof target.fortStatusBand).toBe('string');
  });

  it('reduces two different exact gold amounts in the same band to identical projections', () => {
    const oppA = makeOpponent('opp', 500_000, 300);
    const oppB = makeOpponent('opp', 600_000, 300);
    const obsA = buildPersonaObservation(
      SELF_PLAYER,
      [oppA],
      'farmer',
      'greedy',
      'active',
      BUILD_OPTS,
    );
    const obsB = buildPersonaObservation(
      SELF_PLAYER,
      [oppB],
      'farmer',
      'greedy',
      'active',
      BUILD_OPTS,
    );
    expect(obsA.targets[0]).toEqual(obsB.targets[0]);
  });

  it('hides exact opponent state so the policy decision is identical for identical observations', () => {
    const self = makeQuietFarmerSelf('greedy');
    const obs = makeObservation(self, []);
    const tactical = makeTactical('farmer', 'greedy');
    const decisionA = decidePersonaPolicy(obs, tactical, createRng(1)).decision;
    const decisionB = decidePersonaPolicy(obs, tactical, createRng(1)).decision;
    expect(decisionB).toEqual(decisionA);
  });

  it('EMPTY_THREAT_SIGNALS has every threat field zeroed/absent', () => {
    expect(EMPTY_THREAT_SIGNALS.attacksSuffered7d).toBe(0);
    expect(EMPTY_THREAT_SIGNALS.fortBreachedLast7d).toBe(false);
    expect(EMPTY_THREAT_SIGNALS.daysSinceLastThreat).toBe(0);
    expect(EMPTY_THREAT_SIGNALS.fortBreachDaysAgo).toBeNull();
  });

  it('produces a stable self observation regardless of opponent count', () => {
    const obs0 = buildPersonaObservation(
      SELF_PLAYER,
      [],
      'farmer',
      'greedy',
      'active',
      BUILD_OPTS,
    );
    const obs2 = buildPersonaObservation(
      SELF_PLAYER,
      [makeOpponent('a', 100_000, 50), makeOpponent('b', 300_000, 80)],
      'farmer',
      'greedy',
      'active',
      BUILD_OPTS,
    );
    expect(obs2.self).toEqual(obs0.self);
  });
});

describe('observation determinism', () => {
  it('same inputs produce identical observations (seed-independent projection)', () => {
    const opp = makeOpponent('opp', 250_000, 200);
    const a = buildPersonaObservation(
      SELF_PLAYER,
      [opp],
      'farmer',
      'adaptive',
      'active',
      BUILD_OPTS,
    );
    const b = buildPersonaObservation(
      SELF_PLAYER,
      [opp],
      'farmer',
      'adaptive',
      'active',
      BUILD_OPTS,
    );
    expect(a).toEqual(b);
  });
});

describe('initial tactical state', () => {
  it('starts every persona at alert level 0 with stable identity', () => {
    expect(createInitialTacticalState('farmer', 'adaptive')).toEqual({
      persona: 'farmer',
      farmerVariant: 'adaptive',
      alertLevel: 0,
    });
    expect(createInitialTacticalState('attacker')).toEqual({
      persona: 'attacker',
      farmerVariant: undefined,
      alertLevel: 0,
    });
  });
});
