import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications, levelXPArray } from '@/constants';
import UserModel from '@/models/Users';
import { executeAttack } from '@/utils/attackFunctions';
import {
  calculateCasualtyBudget,
  calculateDailyReplacementThroughput,
  V5_COMBAT_CONSTANTS,
} from '@/utils/balance/v5Combat';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';

// See battleOutcome.test.ts: restore seeded-random pass-through when an
// earlier test file in this process leaked the global mtRand mock.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

const FULL_PRESS = {
  turns: 10,
  levelDifference: 0,
  winQuality: 1,
  fortHpPercent: 0,
  defensePressureToday: 0,
};

describe('calculateDailyReplacementThroughput', () => {
  it('is capacity-based: full click income plus housing output', () => {
    expect(calculateDailyReplacementThroughput({ houseCitizens: 20 })).toBe(
      270,
    ); // 225 self + 25 received + 20 housing
  });

  it('caps the subscriber contribution toward casualty budgets', () => {
    expect(
      calculateDailyReplacementThroughput({
        houseCitizens: 0,
        isSubscriber: true,
      }),
    ).toBe(250 + V5_COMBAT_CONSTANTS.SUBSCRIBER_BUDGET_CITIZENS_PER_DAY_CAP);
  });

  it('applies the race recovery multiplier', () => {
    expect(
      calculateDailyReplacementThroughput({
        houseCitizens: 100,
        race: 'GOBLIN',
      }),
    ).toBeCloseTo(350 * 1.05, 5);
  });
});

describe('calculateCasualtyBudget ceiling', () => {
  it('never exceeds 5 days of rebuild throughput', () => {
    const budget = calculateCasualtyBudget({
      ...FULL_PRESS,
      dailyThroughput: 270,
      population: 100000, // 8% of population is far above the throughput cap
    });
    expect(budget).toBeCloseTo(270 * 5, 0);
  });

  it('never exceeds 8% of the population at risk', () => {
    const budget = calculateCasualtyBudget({
      ...FULL_PRESS,
      dailyThroughput: 100000, // throughput cap far above the population cap
      population: 1000,
    });
    expect(budget).toBeCloseTo(80, 0);
  });

  it('reduces the budget for short-commitment raids', () => {
    const full = calculateCasualtyBudget({
      ...FULL_PRESS,
      dailyThroughput: 270,
      population: 100000,
    });
    const poke = calculateCasualtyBudget({
      ...FULL_PRESS,
      turns: 1,
      dailyThroughput: 270,
      population: 100000,
    });
    expect(poke).toBeLessThan(full * 0.1);
  });

  it('reduces the budget while the fort stands', () => {
    const dead = calculateCasualtyBudget({
      ...FULL_PRESS,
      dailyThroughput: 270,
      population: 100000,
    });
    const fortified = calculateCasualtyBudget({
      ...FULL_PRESS,
      fortHpPercent: 1,
      dailyThroughput: 270,
      population: 100000,
    });
    expect(fortified).toBeCloseTo(dead * 0.7 * 0.75, 0);
  });

  it('protects the lower-level side of a mismatch', () => {
    const parity = calculateCasualtyBudget({
      ...FULL_PRESS,
      dailyThroughput: 270,
      population: 100000,
    });
    const hitFromAbove = calculateCasualtyBudget({
      ...FULL_PRESS,
      // levelDifference = opponent - user: attacker 5 levels above the defender
      levelDifference: 5,
      dailyThroughput: 270,
      population: 100000,
    });
    expect(hitFromAbove).toBeLessThan(parity);
  });

  it('a zero replacement or population budget remains zero', () => {
    expect(
      calculateCasualtyBudget({
        ...FULL_PRESS,
        dailyThroughput: 0,
        population: 100000,
      }),
    ).toBe(0);
    expect(
      calculateCasualtyBudget({
        ...FULL_PRESS,
        dailyThroughput: 100000,
        population: 0,
      }),
    ).toBe(0);
  });
});

/** Builds a UserModel with exact level/race and a unit roster. */
function buildUser(opts: {
  race: string;
  level: number;
  fortLevel: number;
  gold: bigint;
  units: Array<[string, number, number]>;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(
      Fortifications.find((f) => f.level === opts.fortLevel)?.hitpoints ?? 500,
    )
    .adjustGold(opts.gold - 25000n)
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  g.addUnits(
    opts.units.map(([type, level, quantity], i) => ({
      id: i,
      userId: 1,
      type,
      level,
      quantity,
      isMercenary: false,
    })) as any,
  );
  const raw = g.getUser() as any;
  raw.race = opts.race;
  raw.class = 'FIGHTER';
  raw.experience = levelXPArray.find((l) => l.level === opts.level)?.xp ?? 0;
  return new UserModel(raw);
}

const RAIDER = { race: 'HUMAN', level: 25, fortLevel: 6, gold: 1_000_000n };
const FORTIFIED = { race: 'UNDEAD', level: 20, fortLevel: 5, gold: 5_000_000n };

function buildRaider(): UserModel {
  return buildUser({ ...RAIDER, units: [['OFFENSE', 2, 10000]] });
}

function buildFortified(): UserModel {
  return buildUser({
    ...FORTIFIED,
    units: [
      ['DEFENSE', 2, 4000],
      ['DEFENSE', 1, 1000],
      ['WORKER', 1, 5000],
      ['OFFENSE', 2, 5000],
    ],
  });
}

describe('battle casualty integration', () => {
  it('never wipes a unit stack: per-stack cap spreads losses upward', async () => {
    const attacker = buildRaider();
    const defender = buildFortified();
    const result = await executeAttack(
      attacker as any,
      defender as any,
      10,
      false,
      {
        random: createSeededRandom('stack-cap-1'),
      },
    );

    const defenderLosses = result.Losses.Defender.units;
    expect(defenderLosses.length).toBeGreaterThan(0);
    for (const loss of defenderLosses) {
      const initial =
        (
          {
            'DEFENSE,2': 4000,
            'DEFENSE,1': 1000,
            WORKER: 5000,
            'OFFENSE,2': 5000,
          } as any
        )[`${loss.type},${loss.level}`] ?? 0;
      expect(initial).toBeGreaterThan(0);
      // Killed (post wounded-split) plus wounded must respect the 40% stack cap.
      const wounded =
        (result as any).wounded.defender.find(
          (w: any) => w.type === loss.type && w.level === loss.level,
        )?.quantity ?? 0;
      expect(loss.quantity + wounded).toBeLessThanOrEqual(
        Math.floor(initial * V5_COMBAT_CONSTANTS.PER_STACK_CASUALTY_CAP),
      );
    }
  });

  it('splits casualties into killed and wounded shares', async () => {
    const attacker = buildRaider();
    const defender = buildFortified();
    const result = await executeAttack(
      attacker as any,
      defender as any,
      10,
      false,
      {
        random: createSeededRandom('wounded-1'),
      },
    );

    const woundedDefender = (result as any).wounded.defender as Array<{
      type: string;
      level: number;
      quantity: number;
    }>;
    const totalWounded = woundedDefender.reduce((s, w) => s + w.quantity, 0);
    const killed = result.Losses.Defender.total;

    if (killed + totalWounded > 0) {
      // Wounded share is applied per stack; overall it must stay near 30%.
      expect(totalWounded).toBeGreaterThan(0);
      const share = totalWounded / (killed + totalWounded);
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.4);
    }
  });

  it('bounds attacker losses by the same replacement budget', async () => {
    const attacker = buildRaider();
    const defender = buildFortified();
    const result = await executeAttack(
      attacker as any,
      defender as any,
      10,
      false,
      {
        random: createSeededRandom('attacker-cap-1'),
      },
    );

    const attackerKilled = result.Losses.Attacker.total;
    const attackerWounded = (
      (result as any).wounded.attacker as Array<{ quantity: number }>
    ).reduce((s, w) => s + w.quantity, 0);
    // 8% of the 10,000 committed knights = 800 ceiling.
    expect(attackerKilled + attackerWounded).toBeLessThanOrEqual(800);
  });

  it('enforces the daily dogpile allowance across the whole battle', async () => {
    const attacker = buildRaider();
    const defender = buildFortified();
    const result = await executeAttack(
      attacker as any,
      defender as any,
      10,
      false,
      {
        random: createSeededRandom('dogpile-1'),
        defenderDailyCasualtyRemaining: 5,
      },
    );

    const defenderKilled = result.Losses.Defender.total;
    const defenderWounded = (
      (result as any).wounded.defender as Array<{ quantity: number }>
    ).reduce((s, w) => s + w.quantity, 0);
    expect(defenderKilled + defenderWounded).toBeLessThanOrEqual(5);
  });

  it('sub-unit population, stack and daily budgets never force one loss', async () => {
    for (const quantity of [1, 12]) {
      const attacker = buildUser({
        ...RAIDER,
        units: [['OFFENSE', 1, quantity]],
      });
      const defender = buildUser({
        ...FORTIFIED,
        units: [['DEFENSE', 2, 100000]],
      });
      const result = await executeAttack(attacker, defender, 10, false, {
        random: createSeededRandom(`tiny-army-${quantity}`),
      });
      expect(result.Losses.Attacker.total).toBe(0);
      expect(
        result.wounded.attacker.reduce((sum, group) => sum + group.quantity, 0),
      ).toBe(0);
      expect(
        attacker.units
          .filter((unit) => unit.type === 'OFFENSE')
          .reduce((sum, unit) => sum + unit.quantity, 0),
      ).toBe(quantity);
    }
    const attacker = buildRaider();
    const defender = buildFortified();
    const result = await executeAttack(attacker, defender, 10, false, {
      random: createSeededRandom('fractional-daily-cap'),
      defenderDailyCasualtyRemaining: 0.9,
    });
    expect(result.Losses.Defender.total).toBe(0);
    expect(
      result.wounded.defender.reduce((sum, group) => sum + group.quantity, 0),
    ).toBe(0);
  });

  it('regular and mercenary active survivors plus killed and wounded conserve each roster', async () => {
    const attacker = buildRaider();
    const defender = buildFortified();
    defender.mercenaries = [
      {
        id: 100,
        userId: defender.id,
        type: 'DEFENSE',
        level: 1,
        quantity: 300,
        isMercenary: true,
      },
    ];
    const initial = [...defender.units, ...defender.mercenaries].map(
      (unit) => ({ ...unit }),
    );
    const result = await executeAttack(attacker, defender, 10, false, {
      random: createSeededRandom('roster-conservation'),
      defenderDailyCasualtyRemaining: 17,
    });
    let activeAttrition = 0;
    for (const unit of initial) {
      const matches = (entry: {
        type: string;
        level: number;
        isMercenary?: boolean;
      }) =>
        entry.type === unit.type &&
        entry.level === unit.level &&
        !!entry.isMercenary === !!unit.isMercenary;
      const remaining = [...defender.units, ...defender.mercenaries]
        .filter(matches)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const killed = result.Losses.Defender.units
        .filter(matches)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const wounded = result.wounded.defender
        .filter(matches)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      expect(remaining + killed + wounded).toBe(unit.quantity);
      expect(killed + wounded).toBeLessThanOrEqual(
        Math.floor(unit.quantity * V5_COMBAT_CONSTANTS.PER_STACK_CASUALTY_CAP),
      );
      activeAttrition += killed + wounded;
    }
    expect(activeAttrition).toBe(17);
  });
});
