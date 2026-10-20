import { describe, expect, it } from 'bun:test';

import {
  computeSpySuccessProbability,
  resolveSpyMissionSuccess,
} from '@/utils/balance/effectiveStats';
import { calculateCombatStrength } from '@/utils/combatStrength';
import { createSeededRandom } from '@/utils/random';
import { type SpyMissionUser, type SpyRosterUnit } from '@/utils/spy/results';
import {
  CITIZEN_WORKERS_TARGET,
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';

function user(
  units: SpyRosterUnit[],
  mercenaries: SpyRosterUnit[] = [],
): SpyMissionUser {
  return {
    units,
    mercenaries,
    items: [],
    fortLevel: 16,
    fortHitpoints: 10000,
    race: 'ALL',
    gold: 123456n,
    goldInBank: 654321n,
    structure_upgrades: [
      { type: 'SPY', level: 22 },
      { type: 'SENTRY', level: 16 },
    ],
    spyBonus: 0,
    sentryBonus: 0,
  };
}

function rosterSize(value: SpyMissionUser): number {
  return [...value.units, ...(value.mercenaries ?? [])].reduce(
    (sum, unit) => sum + unit.quantity,
    0,
  );
}

const targets = [
  'CITIZEN',
  'WORKER',
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
] as const;

describe('unified spy mission gate', () => {
  it('uses continuous logistic odds around former extreme-ratio discontinuities', () => {
    for (const ratio of [0.25, 4]) {
      const before = computeSpySuccessProbability({
        attackerSpy: (ratio - 0.00001) * 1000,
        defenderSentry: 1000,
      });
      const after = computeSpySuccessProbability({
        attackerSpy: (ratio + 0.00001) * 1000,
        defenderSentry: 1000,
      });
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after - before).toBeLessThan(0.0001);
    }
    const odds = Math.exp(0.2) * 1.5 ** 2.4;
    expect(
      computeSpySuccessProbability({
        attackerSpy: 1500,
        defenderSentry: 1000,
        situationalModifier: 0.2,
      }),
    ).toBeCloseTo(odds / (1 + odds), 10);
  });

  it('fails zero capability even when the injected roll is zero', () => {
    expect(
      resolveSpyMissionSuccess({
        attackerSpy: 0,
        defenderSentry: 0,
        random: () => 0,
      }),
    ).toEqual({ success: false, probability: 0 });
    const attacker = user([{ type: 'SPY', level: 3, quantity: 50 }]);
    const result = simulateIntel(attacker, user([]), 1, { random: () => 0 });
    expect(result.success).toBe(false);
    expect(result.spiesSent).toBe(0);
    expect(rosterSize(attacker)).toBe(50);
  });

  it('bounds failed one-agent loss across split regular and mercenary rows', () => {
    const attacker = user(
      [
        { type: 'SPY', level: 3, quantity: 1 },
        { type: 'SPY', level: 3, quantity: 1 },
      ],
      [{ type: 'SPY', level: 3, quantity: 2 }],
    );
    const before = rosterSize(attacker);
    const result = simulateAssassination(
      attacker,
      user([{ type: 'SENTRY', level: 3, quantity: 1000 }]),
      1,
      'WORKER',
      { random: () => 0.999, turns: 10 },
    );
    expect(result.success).toBe(false);
    expect(result.spiesLost).toBe(1);
    expect(before - rosterSize(attacker)).toBe(result.spiesLost);
    expect(attacker.units.map((unit) => unit.quantity)).toEqual([0, 1]);
    expect(attacker.mercenaries?.[0]?.quantity).toBe(2);
  });
});

describe('assassination dispatch and target conservation', () => {
  for (const target of targets) {
    it(`damages actual ${target} rosters without killing untargeted sentries`, () => {
      const attacker = user([{ type: 'SPY', level: 3, quantity: 100 }]);
      const defender = user(
        [
          { type: target, level: 1, quantity: 20 },
          ...(target === 'SENTRY'
            ? []
            : [{ type: 'SENTRY' as const, level: 1, quantity: 1 }]),
          { type: 'CITIZEN', level: 1, quantity: 10000 },
        ],
        [{ type: target, level: 1, quantity: 300 }],
      );
      const before = rosterSize(defender);
      const result = simulateAssassination(attacker, defender, 70, target, {
        random: () => 0.5,
        turns: 10,
      });
      expect(result.success).toBe(true);
      expect(result.unitsKilled).toBeGreaterThan(0);
      expect(before - rosterSize(defender)).toBe(result.unitsKilled);
      expect(result.targetLosses.every((loss) => loss.type === target)).toBe(
        true,
      );
      if (target !== 'SENTRY')
        expect(
          defender.units.find((unit) => unit.type === 'SENTRY')?.quantity,
        ).toBe(1);
      expect(
        [...defender.units, ...(defender.mercenaries ?? [])].every(
          (unit) => unit.quantity >= 0,
        ),
      ).toBe(true);
    });
  }

  it('removes civilian targets in actual regular-before-mercenary roster order', () => {
    const defender = user(
      [
        { type: 'CITIZEN', level: 1, quantity: 2 },
        { type: 'WORKER', level: 1, quantity: 2 },
      ],
      [{ type: 'WORKER', level: 1, quantity: 1000 }],
    );
    const result = simulateAssassination(
      user([{ type: 'SPY', level: 3, quantity: 70 }]),
      defender,
      70,
      CITIZEN_WORKERS_TARGET,
      { random: () => 0.5, turns: 10 },
    );
    expect(result.unitsKilled).toBe(40);
    expect(defender.units.map((unit) => unit.quantity)).toEqual([0, 0]);
    expect(defender.mercenaries?.[0]?.quantity).toBe(964);
    expect(result.targetLosses).toEqual([
      { type: 'CITIZEN', level: 1, quantity: 2, mercenary: false },
      { type: 'WORKER', level: 1, quantity: 2, mercenary: false },
      { type: 'WORKER', level: 1, quantity: 36, mercenary: true },
    ]);
  });

  it('uses matching target tier defense rather than the first catalog tier', () => {
    const attacker = user([{ type: 'SPY', level: 3, quantity: 1 }]);
    const low = user([
      { type: 'DEFENSE', level: 1, quantity: 100 },
      { type: 'CITIZEN', level: 1, quantity: 10000 },
    ]);
    const high = user([
      { type: 'DEFENSE', level: 3, quantity: 100 },
      { type: 'CITIZEN', level: 1, quantity: 10000 },
    ]);
    const weak = simulateAssassination(
      structuredClone(attacker),
      low,
      1,
      'DEFENSE',
      { random: () => 0.5, turns: 10 },
    );
    const strong = simulateAssassination(
      structuredClone(attacker),
      high,
      1,
      'DEFENSE',
      { random: () => 0.5, turns: 10 },
    );
    expect(weak.unitsKilled).toBeGreaterThan(strong.unitsKilled);
  });

  it('does not spend unsent network agents on target damage or losses', () => {
    const small = user([{ type: 'SPY', level: 3, quantity: 1 }]);
    const large = user([{ type: 'SPY', level: 3, quantity: 1000 }]);
    const defender = user([{ type: 'WORKER', level: 1, quantity: 1000 }]);
    const one = simulateAssassination(
      small,
      structuredClone(defender),
      1,
      'WORKER',
      { random: () => 0.5, turns: 10 },
    );
    const network = simulateAssassination(
      large,
      structuredClone(defender),
      1,
      'WORKER',
      { random: () => 0.5, turns: 10 },
    );
    expect(one.unitsKilled).toBeGreaterThan(0);
    expect(network.unitsKilled).toBe(one.unitsKilled);
    expect(rosterSize(large)).toBe(1000);
  });
});

describe('intel snapshots', () => {
  it('includes exact fort, treasury, and every roster in a full report without retaining live references', () => {
    const defender = user(
      [{ type: 'WORKER', level: 1, quantity: 200 }],
      [{ type: 'OFFENSE', level: 2, quantity: 17 }],
    );
    const result = simulateIntel(
      user([{ type: 'SPY', level: 1, quantity: 1000 }]),
      defender,
      10,
      { random: createSeededRandom('full-intel') },
    );
    expect(result.success).toBe(true);
    expect(result.intelligenceGathered).toMatchObject({
      fortLevel: 16,
      fortHitpoints: 10000,
      gold: 123456n,
      goldInBank: 654321n,
    });
    expect(result.intelligenceGathered?.units).toEqual(defender.units);
    expect(result.intelligenceGathered?.mercenaries).toEqual(
      defender.mercenaries,
    );
    defender.units[0]!.quantity = 0;
    expect(result.intelligenceGathered?.units?.[0]?.quantity).toBe(200);
  });

  it('returns seeded coverage instead of substituting full truth for partial intel', () => {
    // Odds now weight the 3 dispatched spies at 70%, so a larger network keeps entry certain.
    const attacker = user([{ type: 'SPY', level: 1, quantity: 10000 }]);
    const defender = user(
      targets.map((type) => ({ type, level: 1, quantity: 100 })),
    );
    const first = simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      3,
      { random: createSeededRandom('partial-intel') },
    );
    const second = simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      3,
      { random: createSeededRandom('partial-intel') },
    );
    expect(first.intelligenceGathered).toEqual(second.intelligenceGathered);
    expect(first.intelPercentage).toBe(30);
    expect(
      Object.values(first.intelligenceGathered!).filter(
        (value) => value !== null,
      ).length,
    ).toBeLessThan(Object.keys(first.intelligenceGathered!).length);
    for (const unit of first.intelligenceGathered?.units ?? [])
      expect(unit.quantity).toBe(100);
  });

  it('applies and reports intel casualties across regular and mercenary spies', () => {
    const attacker = user(
      [{ type: 'SPY', level: 1, quantity: 1 }],
      [{ type: 'SPY', level: 1, quantity: 2 }],
    );
    // Outmatched by the sentries (#97): the mission fails and every spy sent
    // is lost, regular and mercenary alike.
    const defender = user([{ type: 'SENTRY', level: 1, quantity: 50 }]);
    const result = simulateIntel(attacker, defender, 3, {
      random: () => 0.1,
    });
    expect(result.success).toBe(false);
    expect(result.spiesLost).toBe(3);
    expect(rosterSize(attacker)).toBe(0);
    expect(result.intelligenceGathered).toBeNull();
    expect(result.spyLosses.map((loss) => loss.quantity)).toEqual([1, 2]);
  });
});

describe('bounded monotone infiltration', () => {
  it('never loses damage across the previous branch boundary or longer commitment on the same rolls', () => {
    const attacker = user([{ type: 'SPY', level: 2, quantity: 100 }]);
    const defender = user([{ type: 'SENTRY', level: 1, quantity: 100 }]);
    let previous = 0;
    for (const bonus of [0, 1, 10, 20, 30, 31, 40, 100, 500]) {
      const current = structuredClone(attacker);
      current.spyBonus = bonus;
      const result = simulateInfiltration(
        current,
        structuredClone(defender),
        7,
        { random: () => 0.5, turns: 2 },
      );
      expect(result.fortDmg).toBeGreaterThanOrEqual(previous);
      previous = result.fortDmg;
    }
    previous = 0;
    for (let turns = 2; turns <= 10; turns += 1) {
      const result = simulateInfiltration(
        structuredClone(attacker),
        structuredClone(defender),
        7,
        { random: createSeededRandom('monotone'), turns },
      );
      expect(result.fortDmg).toBeGreaterThanOrEqual(previous);
      expect(result.fortDmg).toBeLessThanOrEqual(1200);
      previous = result.fortDmg;
    }
  });

  it('has no forced damage for a zero fort or missing dispatched tier', () => {
    const zero = user([]);
    zero.fortHitpoints = 0;
    expect(
      simulateInfiltration(
        user([{ type: 'SPY', level: 2, quantity: 7 }]),
        zero,
        7,
        { random: () => 0.5, turns: 10 },
      ).fortDmg,
    ).toBe(0);
    const wrongTier = user([{ type: 'SPY', level: 3, quantity: 100 }]);
    const defender = user([]);
    const result = simulateInfiltration(wrongTier, defender, 7, {
      random: () => 0,
    });
    expect(result.success).toBe(false);
    expect(result.fortDmg).toBe(0);
    expect(defender.fortHitpoints).toBe(10000);
  });

  it('honors sparse equipment in network capability and sent force', () => {
    const attacker = user([{ type: 'SPY', level: 2, quantity: 100 }]);
    attacker.items = [{ usage: 'SPY', type: 'WEAPON', level: 1, quantity: 1 }];
    const sparse = calculateCombatStrength(attacker, 'SPY').totalStats
      .MeleeAtkPower;
    attacker.items[0]!.quantity = 100;
    const covered = calculateCombatStrength(attacker, 'SPY').totalStats
      .MeleeAtkPower;
    expect(covered).toBeGreaterThan(sparse);
  });
});
