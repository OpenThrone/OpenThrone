import { describe, expect, it } from 'bun:test';

import { applyLiveRulesToPlayer } from './liveRules';
import { createLivePowerEstimator, liveCombatPower } from './liveTargeting';
import { generatePopulation } from './population';
import { createRng } from './random';
import type { PlayerState } from './types';

function livePlayer(seed: number): PlayerState {
  const [player] = generatePopulation(1, [15, 15], seed);
  applyLiveRulesToPlayer(player, 'regular', createRng(seed).next);
  return player;
}

describe('liveCombatPower', () => {
  it('counts equipment, as the battle code does', () => {
    const player = livePlayer(1);
    player.inventory = [];
    const bare = liveCombatPower(player, 'OFFENSE');
    player.inventory = [
      { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 1000 },
    ];
    expect(liveCombatPower(player, 'OFFENSE')).toBeGreaterThan(bare);
  });
});

describe('createLivePowerEstimator', () => {
  it('uses the real defense only with intel', () => {
    const attacker = livePlayer(2);
    const target = livePlayer(3);
    const estimator = createLivePowerEstimator(attacker, new Map());
    expect(estimator.target(target, true)).toBe(
      liveCombatPower(target, 'DEFENSE'),
    );
  });

  it('without intel scales its own defense by the visible population', () => {
    const attacker = livePlayer(4);
    const target = livePlayer(4);
    target.id = 'other';
    for (const key of Object.keys(target.units) as Array<
      keyof PlayerState['units']
    >) {
      target.units[key] = attacker.units[key] * 2;
    }
    target.fortLevel = attacker.fortLevel;
    const estimator = createLivePowerEstimator(attacker, new Map());
    expect(estimator.target(target, false)).toBeCloseTo(
      liveCombatPower(attacker, 'DEFENSE') * 2,
    );
  });
});
