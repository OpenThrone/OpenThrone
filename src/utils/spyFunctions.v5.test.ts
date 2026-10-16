import { describe, expect, it } from 'bun:test';

import type { SpyMissionUser } from '@/utils/spy/results';
import { simulateAssassination, simulateIntel } from '@/utils/spyFunctions';

function network(spies: number, sentries: number): SpyMissionUser {
  return {
    units: [
      { type: 'SPY', level: 1, quantity: spies },
      { type: 'SENTRY', level: 1, quantity: sentries },
    ],
    items: [],
    fortLevel: 16,
    race: 'ALL',
    structure_upgrades: [{ type: 'SPY', level: 16 }],
  };
}

describe('spy commitment and mission boundaries', () => {
  it('committed intel overcomes a slight sentry advantage on the same entry roll', () => {
    const attacker = network(1000, 0);
    // Blended odds (70% squad, 30% network) put a 1000-spy network near 220 sentries.
    const defender = network(0, 220);
    const shallow = simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      5,
      { random: () => 0.5, turns: 1 },
    );
    const committed = simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      5,
      { random: () => 0.5, turns: 5 },
    );
    expect(shallow.success).toBe(false);
    expect(committed.success).toBe(true);
    expect(committed.intelPercentage).toBeGreaterThan(50);
  });

  it('defender pressure lowers success odds rather than resampling a favorable verdict', () => {
    const attacker = network(1000, 0);
    // Rescaled for blended odds: 100 sentries is beatable unpressured, not at pressure 64.
    const defender = network(0, 100);
    const first = simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      5,
      { random: () => 0.5, turns: 1, spyPressureToday: 0 },
    );
    const pressured = simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      5,
      { random: () => 0.5, turns: 1, spyPressureToday: 64 },
    );
    expect(first.success).toBe(true);
    expect(pressured.success).toBe(false);
    expect(pressured.successProbability).toBeLessThan(first.successProbability);
  });

  it('a larger dispatched squad beats the same sentries more often than a single spy', () => {
    const odds = (sent: number) =>
      simulateIntel(network(10, 0), network(0, 5), sent, {
        random: () => 0.5,
        turns: 1,
      }).successProbability;
    expect(odds(10)).toBeGreaterThan(odds(5));
    expect(odds(5)).toBeGreaterThan(odds(1));
  });

  it('spy pressure hardens a sentry-less target through phantom sentries', () => {
    const odds = (spyPressureToday: number) =>
      simulateIntel(network(5, 0), network(0, 0), 5, {
        random: () => 0.5,
        turns: 1,
        spyPressureToday,
      }).successProbability;
    expect(odds(10)).toBeLessThan(odds(0));
    expect(odds(30)).toBeLessThan(odds(10));
    expect(odds(30)).toBeGreaterThan(0.4);
    expect(odds(30)).toBeLessThan(0.6);
  });

  it('does not force one civilian death when the population share budget is below one', () => {
    const attacker = network(0, 0);
    attacker.units = [{ type: 'SPY', level: 3, quantity: 1 }];
    const defender = network(0, 0);
    defender.units = [{ type: 'WORKER', level: 1, quantity: 1 }];
    const result = simulateAssassination(attacker, defender, 1, 'WORKER', {
      random: () => 0.5,
      turns: 10,
    });
    expect(result.success).toBe(true);
    expect(result.unitsKilled).toBe(0);
    expect(defender.units[0]!.quantity).toBe(1);
  });

  it('a locked spy upgrade cannot dispatch assassins even with a powerful network', () => {
    const attacker = network(10000, 0);
    attacker.units.push({ type: 'SPY', level: 3, quantity: 10 });
    attacker.structure_upgrades = [{ type: 'SPY', level: 15 }];
    const defender = network(0, 0);
    defender.units = [{ type: 'WORKER', level: 1, quantity: 1000 }];
    const result = simulateAssassination(attacker, defender, 10, 'WORKER', {
      random: () => 0,
      turns: 10,
    });
    expect(result.success).toBe(false);
    expect(result.spiesSent).toBe(0);
    expect(defender.units[0]!.quantity).toBe(1000);
    expect(attacker.units[2]!.quantity).toBe(10);
  });
});

describe('assassination daily caps', () => {
  function assassins(): SpyMissionUser {
    const attacker = network(10000, 0);
    attacker.units.push({ type: 'SPY', level: 3, quantity: 10 });
    return attacker;
  }
  function workers(count: number): SpyMissionUser {
    const defender = network(0, 0);
    defender.units = [{ type: 'WORKER', level: 1, quantity: count }];
    return defender;
  }

  it('kills freely when no daily caps are supplied', () => {
    const defender = workers(2000);
    const result = simulateAssassination(assassins(), defender, 10, 'WORKER', {
      random: () => 0.5,
      turns: 10,
    });
    expect(result.success).toBe(true);
    expect(result.unitsKilled).toBeGreaterThan(5);
  });

  it('never exceeds the shared daily casualty allowance', () => {
    const defender = workers(2000);
    const result = simulateAssassination(assassins(), defender, 10, 'WORKER', {
      random: () => 0.5,
      turns: 10,
      defenderDailyCasualtyRemaining: 3,
    });
    expect(result.success).toBe(true);
    expect(result.unitsKilled).toBe(3);
    expect(defender.units[0]!.quantity).toBe(1997);
  });

  it('never exceeds the per-type daily share and kills nothing once spent', () => {
    const capped = simulateAssassination(
      assassins(),
      workers(2000),
      10,
      'WORKER',
      {
        random: () => 0.5,
        turns: 10,
        targetTypeDailyRemaining: 2,
      },
    );
    expect(capped.unitsKilled).toBe(2);
    const spent = simulateAssassination(
      assassins(),
      workers(2000),
      10,
      'WORKER',
      {
        random: () => 0.5,
        turns: 10,
        targetTypeDailyRemaining: 0,
      },
    );
    expect(spent.success).toBe(true);
    expect(spent.unitsKilled).toBe(0);
  });
});
