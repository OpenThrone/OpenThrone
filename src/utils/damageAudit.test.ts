import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';

installMockMtRand(vi);
const { simulateBattle, distributeCasualties } = require('./attackFunctions');
const BattleResult = require('../models/BattleResult').default;
const UserModel = require('../models/Users').default;
const MockUserGenerator = require('./MockUserGenerator').default;

beforeEach(() => {
  mtRandImpl.fn = () => 0.9;
});

const makeUser = (
  units: Array<{ type: string; quantity: number; level: number }>,
  extra: Record<string, unknown> = {},
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
  gen.adjustGold(BigInt(100000));
  const model = new UserModel(gen.getUser());
  model.mercenaries = [];
  Object.assign(model, extra);
  return model;
};

/** Seeded PRNG so the battle is reproducible. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const runSeeded = async () => {
  const attacker = makeUser([{ type: 'OFFENSE', quantity: 800, level: 1 }]);
  const defender = makeUser([
    { type: 'DEFENSE', quantity: 600, level: 1 },
    { type: 'CITIZEN', quantity: 400, level: 1 },
  ]);
  return simulateBattle(attacker, defender, 500, 10, false, false, {
    random: seeded(42),
  });
};

/** Outcome fields that the audit must never influence. */
const outcomeOf = (r: any) =>
  JSON.stringify({
    result: r.result,
    canonical: r.canonicalOutcome,
    losses: r.Losses,
    wounded: r.wounded,
    routed: r.routedStacks,
    pillagedGold: String(r.pillagedGold),
    xp: r.experienceGained,
    finalFortHP: r.finalFortHP,
    turns: r.turnsTaken,
  });

const expectConsistent = (side: any) => {
  expect(side.rawIn).toBeGreaterThanOrEqual(0);
  expect(side.applied).toBeGreaterThanOrEqual(0);
  expect(side.suppressed).toBeGreaterThanOrEqual(0);
  expect(Math.abs(side.applied + side.suppressed - side.rawIn)).toBeLessThan(
    1e-6,
  );
};

describe('damage audit', () => {
  it('is populated and consistent per side over a battle', async () => {
    const r = await runSeeded();
    expect(r.damageAudit.defender.rawIn).toBeGreaterThan(0);
    expect(r.damageAudit.attacker.rawIn).toBeGreaterThan(0);
    expectConsistent(r.damageAudit.defender);
    expectConsistent(r.damageAudit.attacker);
    expect(r.damageAudit.defender.caps.usedCap).not.toBeNull();
    expect(() => JSON.stringify(r.damageAudit)).not.toThrow();
  });

  it('leaves outcomes unchanged', async () => {
    const r = await runSeeded();
    expect(outcomeOf(r)).toBe(GOLDEN);
  });

  it('shows suppression and the binding cap for a hopeless assault into a capped defender', async () => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([{ type: 'DEFENSE', quantity: 1000, level: 1 }], {
      dailyCasualtyAllowanceRemaining: 0,
    });
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 5000,
      defenderDamageDealt: 0,
      fortHP: 100,
      initialFortHP: 100,
    });
    const audit = result.damageAudit.defender;
    expect(result.Losses.Defender.total).toBe(0);
    expect(audit.rawIn).toBe(5000);
    expect(audit.suppressed).toBe(5000);
    expect(audit.applied).toBe(0);
    expect(audit.caps.dailyRemaining).toBe(0);
    expect(audit.bindingCap).toBe('daily');
  });

  it('keeps the fighting stack cap after a collateral pass', async () => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([
      { type: 'DEFENSE', quantity: 10, level: 1 },
      { type: 'SPY', quantity: 10000, level: 1 },
    ]);
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 10_000_000,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      includeCitz: true,
    });
    const audit = result.damageAudit.defender;
    expect(audit.suppressed).toBeGreaterThan(0);
    expect(audit.bindingCap).not.toBe('none');
  });

  it('caps a decisive attacker below a losing one on the same defense phase', async () => {
    // Same defense-phase hit at turn 10; only the battle so far differs.
    const lossesAfter = async (attackerDealtSoFar: number) => {
      const attacker = makeUser([
        { type: 'OFFENSE', quantity: 2000, level: 1 },
      ]);
      const defender = makeUser([
        { type: 'DEFENSE', quantity: 2000, level: 1 },
      ]);
      const result = new BattleResult(attacker, defender);
      result.damageReceived.defender = attackerDealtSoFar;
      await distributeCasualties({
        result,
        attacker,
        defender,
        attackerDamageDealt: 0,
        defenderDamageDealt: 10_000_000,
        fortHP: 100,
        initialFortHP: 100,
        turn: 10,
      });
      return {
        lost: result.Losses.Attacker.total,
        ceiling: result.damageAudit.attacker.caps.singleAttackCap,
      };
    };
    const losing = await lossesAfter(0);
    const decisive = await lossesAfter(100_000_000);
    // A losing attacker (dealt nothing) keeps full win quality, as before.
    expect(losing.lost).toBeGreaterThan(losing.ceiling * 0.95);
    // A decisive attacker (dealt 10x what it took) stays well under 8%.
    expect(decisive.lost).toBeGreaterThan(0);
    expect(decisive.lost).toBeLessThan(losing.lost);
    expect(decisive.lost).toBeLessThan(decisive.ceiling);
    // ...but the 0.5 attacker floor keeps at least about half the cost.
    expect(decisive.lost).toBeGreaterThanOrEqual(
      Math.floor(losing.lost * 0.45),
    );
  });

  it('labels the protected cap for protected defenders', async () => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([{ type: 'DEFENSE', quantity: 1000, level: 1 }]);
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 10_000_000,
      defenderDamageDealt: 0,
      fortHP: 100,
      initialFortHP: 100,
      turn: 10,
      isDefenderProtected: true,
    });
    const audit = result.damageAudit.defender;
    expect(audit.suppressed).toBeGreaterThan(0);
    expectConsistent(audit);
    expect(audit.caps.protectedCap).not.toBeNull();
    expect(['protected', 'singleAttack', 'soft']).toContain(audit.bindingCap);
  });
});

/**
 * Captured with the same seed. Re-baselined deliberately for #200: casualty
 * win quality is now battle-cumulative, so this decisive attacker loses 44 -> 22 (0.5 attacker floor)
 * (the rest follows from its larger surviving army). Everything else matches
 * the pre-audit code (c5905844).
 */
const GOLDEN =
  '{"result":"WIN","canonical":{"winner":"ATTACKER","reason":"ASSAULT_SUCCEEDED","attackerValueLost":46500,"defenderValueLost":67500,"fortValueDamage":300,"pillagedGoldValue":58,"netGainValue":-46442,"defenseUnitsBroken":45,"assaultSucceeded":true},"losses":{"Attacker":{"total":22,"units":[{"id":0,"userId":0,"type":"OFFENSE","level":1,"isMercenary":false,"quantity":22}]},"Defender":{"total":32,"units":[{"id":0,"userId":0,"type":"DEFENSE","level":1,"isMercenary":false,"quantity":32}]}},"wounded":{"attacker":[{"type":"OFFENSE","level":1,"quantity":9,"isMercenary":false}],"defender":[{"type":"DEFENSE","level":1,"quantity":13,"isMercenary":false}]},"routed":[],"pillagedGold":"58","xp":{"attacker":2285,"defender":571},"finalFortHP":440,"turns":10}';
