import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';

installMockMtRand(vi);
const { simulateBattle, distributeCasualties } = require('./attackFunctions');
const BattleResult = require('../models/BattleResult').default;
const UserModel = require('../models/Users').default;
const MockUserGenerator = require('./MockUserGenerator').default;
const { COMBAT_RULESETS } = require('./balance/combatRulesets');

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
  // Pinned to combat-v11: the golden predates v12's cap-rounding draw, and
  // this test only proves the audit never changes an outcome.
  return simulateBattle(attacker, defender, 500, 10, false, false, {
    random: seeded(42),
    ruleset: COMBAT_RULESETS['combat-v11'],
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
// Recorded with the seeded stream reaching combat (test/utils/mockMtRand.ts).
const GOLDEN =
  '{"result":"WIN","canonical":{"winner":"ATTACKER","reason":"ASSAULT_SUCCEEDED","attackerValueLost":61500,"defenderValueLost":69000,"fortValueDamage":330,"pillagedGoldValue":6469,"netGainValue":-55031,"defenseUnitsBroken":46,"assaultSucceeded":true},"losses":{"Attacker":{"total":29,"units":[{"id":0,"userId":0,"type":"OFFENSE","level":1,"isMercenary":false,"quantity":29}]},"Defender":{"total":33,"units":[{"id":0,"userId":0,"type":"DEFENSE","level":1,"isMercenary":false,"quantity":33}]}},"wounded":{"attacker":[{"type":"OFFENSE","level":1,"quantity":12,"isMercenary":false}],"defender":[{"type":"DEFENSE","level":1,"quantity":13,"isMercenary":false}]},"routed":[],"pillagedGold":"6469","xp":{"attacker":2285,"defender":571},"finalFortHP":434,"turns":10}';

describe('mercenaries take the front line', () => {
  const lose = async (mercQty: number, damage: number) => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([
      { type: 'DEFENSE', quantity: 1000, level: 1 },
      { type: 'CITIZEN', quantity: 100000, level: 1 },
    ]);
    defender.mercenaries = mercQty
      ? [
          {
            type: 'DEFENSE',
            level: 1,
            quantity: mercQty,
            isMercenary: true,
            forceKind: 'MERCENARY',
          },
        ]
      : [];
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: damage,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      turn: 10,
    });
    const { units } = result.Losses.Defender;
    const sum = (merc: boolean) =>
      units
        .filter((u: any) => !!u.isMercenary === merc)
        .reduce((n: number, u: any) => n + u.quantity, 0);
    return { merc: sum(true), own: sum(false) };
  };

  it('puts the heavier share of a line’s losses on mercenaries', async () => {
    const { merc, own } = await lose(1000, 1000);
    expect(merc).toBeGreaterThan(own);
    expect(own).toBeGreaterThan(0);
  });

  const run = async (defender: any, damage: number) => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: damage,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      turn: 10,
    });
    return result.Losses.Defender.units as any[];
  };

  it('spills a capped line onto its own mercenaries before the next level', async () => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([
      { type: 'DEFENSE', quantity: 61, level: 1 },
      { type: 'DEFENSE', quantity: 1000, level: 2 },
      { type: 'CITIZEN', quantity: 100000, level: 1 },
    ]);
    defender.mercenaries = [
      { type: 'DEFENSE', level: 1, quantity: 100, isMercenary: true },
    ];
    const result = new BattleResult(attacker, defender);
    // Earlier turns left the 100 level-1 regulars one short of their 40 cap.
    result.Losses.Defender.units.push({
      type: 'DEFENSE',
      level: 1,
      quantity: 39,
      isMercenary: false,
    });
    result.Losses.Defender.total = 39;
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 400,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      turn: 10,
    });
    const units = result.Losses.Defender.units as any[];
    const lost = (level: number, merc: boolean) =>
      units
        .filter((u) => u.level === level && !!u.isMercenary === merc)
        .reduce((n, u) => n + u.quantity, 0);
    expect(lost(1, true)).toBeGreaterThan(0);
    expect(lost(2, false)).toBe(0);
  });

  it('splits a line’s mercenary share fairly across contracts', async () => {
    const defender = makeUser([
      { type: 'DEFENSE', quantity: 1000, level: 1 },
      { type: 'CITIZEN', quantity: 100000, level: 1 },
    ]);
    defender.mercenaries = [1, 2].map((id) => ({
      type: 'DEFENSE',
      level: 1,
      quantity: 500,
      isMercenary: true,
      forceKind: 'MERCENARY',
      forceContractId: id,
    }));
    const units = await run(defender, 1500);
    const contract = (id: number) =>
      units.find((u) => u.isMercenary && u.forceContractId === id)?.quantity ??
      0;
    expect(Math.abs(contract(1) - contract(2))).toBeLessThanOrEqual(1);
  });

  it('leaves armies without mercenaries unchanged', async () => {
    const { merc, own } = await lose(0, 1000);
    expect(merc).toBe(0);
    expect(own).toBeGreaterThan(0);
  });
});

describe('mercenary front line keeps the won-assault hit', () => {
  it('still kills one defender on a mixed line from a single blow', async () => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([{ type: 'DEFENSE', quantity: 10, level: 1 }]);
    defender.mercenaries = [
      {
        type: 'DEFENSE',
        level: 1,
        quantity: 10,
        isMercenary: true,
        forceKind: 'MERCENARY',
        forceContractId: 7,
      },
    ];
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 10,
      defenderDamageDealt: 0,
      fortHP: 100,
      initialFortHP: 100,
      turn: 1,
      assaultSucceeded: true,
    });
    expect(result.Losses.Defender.total).toBe(1);
  });
});

describe('troop-only chip spares assaults that break through', () => {
  const { deriveCombatRuleset } = require('./balance/combatRuleset');
  const { CURRENT_COMBAT_RULESET } = require('./balance/combatRulesets');
  const SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];
  const kit = (usage: string, quantity: number) =>
    SLOTS.map((type) => ({ usage, type, level: 1, quantity }));
  const firstAssault = async (pressure: number, troopChip: boolean) => {
    const ruleset = deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
      constants: { CHIP_FROM_TROOPS_ONLY: troopChip },
    });
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 100, level: 1 }], {
      items: kit('OFFENSE', 100),
    });
    const defender = makeUser(
      [
        { type: 'DEFENSE', quantity: 110, level: 1 },
        { type: 'CITIZEN', quantity: 400, level: 1 },
      ],
      { items: kit('DEFENSE', 110), defensePressureToday: pressure },
    );
    const r = await simulateBattle(attacker, defender, 500, 1, false, false, {
      random: seeded(7),
      ruleset,
    });
    const hit = r.mitigationLog.find((m: any) => m.source === 'ATTACKER');
    return { result: r.result, damage: hit.mitigatedDamage };
  };

  it('keeps full damage on a breach only a tired garrison allows', async () => {
    const off = await firstAssault(60, false);
    const on = await firstAssault(60, true);
    expect(on.result).toBe('WIN');
    expect(on.damage).toBe(off.damage);
  });

  it('still shrinks chip on a defense that holds', async () => {
    const off = await firstAssault(0, false);
    const on = await firstAssault(0, true);
    expect(on.result).toBe('LOSS');
    expect(on.damage).toBeLessThan(off.damage);
  });
});

describe('mercenary front line with a tiny contract', () => {
  const lossesWith = async (contracts: number[]) => {
    const attacker = makeUser([{ type: 'OFFENSE', quantity: 10, level: 1 }]);
    const defender = makeUser([{ type: 'DEFENSE', quantity: 1000, level: 1 }]);
    defender.mercenaries = contracts.map((quantity, i) => ({
      type: 'DEFENSE',
      level: 1,
      quantity,
      isMercenary: true,
      forceKind: 'MERCENARY',
      forceContractId: i + 1,
    }));
    const result = new BattleResult(attacker, defender);
    await distributeCasualties({
      result,
      attacker,
      defender,
      attackerDamageDealt: 150,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      turn: 10,
    });
    const sum = (merc: boolean) =>
      (result.Losses.Defender.units as any[])
        .filter((u) => !!u.isMercenary === merc)
        .reduce((n, u) => n + u.quantity, 0);
    return { merc: sum(true), own: sum(false) };
  };

  it('splits a line the same way whether its mercenaries hold one contract or two', async () => {
    const one = await lossesWith([100]);
    const two = await lossesWith([99, 1]);
    expect(one.own).toBeGreaterThan(0);
    expect(Math.abs(two.merc - one.merc)).toBeLessThanOrEqual(1);
    expect(Math.abs(two.own - one.own)).toBeLessThanOrEqual(1);
  });
});
