import { describe, expect, it } from 'bun:test';

import { makeDailyDecisions } from './behaviors';
import { generatePopulation } from './population';
import { createRng } from './random';
import type { PlayerState } from './types';

function makeAttacker(level = 12): PlayerState {
  const [player] = generatePopulation(1, [level, level], 3);
  player.behavior = {
    ...player.behavior,
    aggression: 0.9,
    riskTolerance: 0.8,
    activityLevel: 1,
    turnStrategy: 'aggressive',
    primaryGoal: 'growth',
    // Aggressive personas attack through fatigue; no offense-multiplier floor.
    minOffenseMultiplier: undefined,
  };
  return player;
}

describe('makeDailyDecisions stamina handling', () => {
  it('spends attack turns at low stamina, since fatigue only softens attacks', () => {
    const player = makeAttacker();
    player.attackTurns = 30;
    player.stamina = 0;
    const population = generatePopulation(20, [10, 14], 15);

    const decision = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });

    expect(decision.attacks.length).toBeGreaterThan(0);
  });

  it('holds attacks for personas whose minOffenseMultiplier is not met yet', () => {
    const player = makeAttacker();
    player.behavior = { ...player.behavior, minOffenseMultiplier: 0.9 };
    player.attackTurns = 30;
    player.stamina = 20; // offense multiplier 0.88
    const population = generatePopulation(20, [10, 14], 15);

    const fatigued = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });
    expect(fatigued.attacks).toHaveLength(0);

    player.stamina = 40; // offense multiplier 0.96
    const recovered = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });
    expect(recovered.attacks.length).toBeGreaterThan(0);
  });

  it('still rests below staminaFloor, since battle XP scales with stamina', () => {
    const player = makeAttacker();
    player.behavior = { ...player.behavior, staminaFloor: 90 };
    player.attackTurns = 50;
    player.stamina = 50; // offense multiplier is 1, so only XP-rest holds it back
    const population = generatePopulation(20, [10, 14], 15);

    const resting = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });
    expect(resting.attacks).toHaveLength(0);

    player.stamina = 100;
    const rested = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });
    expect(rested.attacks.length).toBeGreaterThan(0);
  });
});
