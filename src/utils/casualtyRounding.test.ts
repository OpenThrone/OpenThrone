import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';

import { COMBAT_RULESETS } from './balance/combatRulesets';
import { createSeededRandom } from './random';

installMockMtRand(vi);
const { distributeCasualties } = require('./attackFunctions');
const BattleResult = require('../models/BattleResult').default;
const UserModel = require('../models/Users').default;
const MockUserGenerator = require('./MockUserGenerator').default;

beforeEach(() => {
  mtRandImpl.fn = () => 0.9;
});

const makeUser = (
  units: Array<{ type: string; quantity: number; level: number }>,
) => {
  const gen = new MockUserGenerator();
  gen.setBasicInfo({
    email: `u${Math.random()}@example.com`,
    display_name: 'U',
    race: 'HUMAN',
    class: 'FIGHTER',
  });
  gen.clearUnits();
  gen.addUnits(normUnits(units));
  const model = new UserModel(gen.getUser());
  model.mercenaries = [];
  return model;
};

/** One turn where a 10-unit army takes overwhelming damage. */
const smallArmyLosses = async (
  version: string,
  random?: () => number,
  turns = 1,
) => {
  const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
  const defender = makeUser([{ type: 'DEFENSE', quantity: 500, level: 1 }]);
  const result = new BattleResult(attacker, defender);
  for (let turn = 1; turn <= turns; turn += 1) {
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 0,
      defenderDamageDealt: 1_000_000,
      fortHP: 100,
      initialFortHP: 100,
      turn,
      ruleset: COMBAT_RULESETS[version],
      random,
    });
  }
  return { losses: result.Losses.Attacker.total, result };
};

describe('stochastic casualty cap rounding (combat-v12)', () => {
  it('combat-v11 never lets a 10-unit army lose anyone', async () => {
    const { losses } = await smallArmyLosses('combat-v11', () => 0.99);
    expect(losses).toBe(0);
  });

  it('combat-v12 rounds the cap up when the draw covers the fraction', async () => {
    expect((await smallArmyLosses('combat-v12', () => 0.99)).losses).toBe(1);
    expect((await smallArmyLosses('combat-v12', () => 0.01)).losses).toBe(0);
  });

  it('loses units at the intended rate on average', async () => {
    // The cap before rounding is x < 1 here, so a draw u loses one unit
    // exactly when u >= 1 - x. Find that threshold to read x back.
    let threshold = 1;
    for (let u = 0; u < 1; u += 0.001) {
      if ((await smallArmyLosses('combat-v12', () => u)).losses === 1) {
        threshold = u;
        break;
      }
    }
    const rawCap = 1 - threshold;
    expect(rawCap).toBeGreaterThan(0);

    const runs = 4000;
    const random = createSeededRandom('casualty-rounding');
    let total = 0;
    for (let i = 0; i < runs; i += 1)
      total += (await smallArmyLosses('combat-v12', random)).losses;
    expect(Math.abs(total / runs - rawCap)).toBeLessThan(0.02);
  });

  it('draws once per side per battle, not every turn', async () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return 0.5;
    };
    await smallArmyLosses('combat-v12', random, 5);
    expect(calls).toBe(1);
  });

  it('keeps plain floor rounding when no seeded random is passed', async () => {
    expect((await smallArmyLosses('combat-v12')).losses).toBe(0);
  });
});
