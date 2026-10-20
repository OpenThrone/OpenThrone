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
  // #97: a mission succeeds when the attacker's spy force is greater than the
  // defender's sentry force; equal or weaker fails. No dice roll decides it.
  const intel = (
    attacker: SpyMissionUser,
    defender: SpyMissionUser,
    options: { turns?: number; spyPressureToday?: number; sent?: number } = {},
  ) =>
    simulateIntel(
      structuredClone(attacker),
      structuredClone(defender),
      options.sent ?? 5,
      {
        random: () => 0.5,
        turns: options.turns ?? 1,
        spyPressureToday: options.spyPressureToday ?? 0,
      },
    );
  /** Smallest sentry count that stops `attacker` under `options`. */
  const firstStoppingSentries = (
    attacker: SpyMissionUser,
    options: { turns?: number; spyPressureToday?: number } = {},
  ) => {
    for (let sentries = 1; sentries <= 5000; sentries++) {
      if (!intel(attacker, network(0, sentries), options).success)
        return sentries;
    }
    return Infinity;
  };

  it('the greater spy force wins and the weaker one fails', () => {
    expect(intel(network(1000, 0), network(0, 10)).success).toBe(true);
    expect(intel(network(10, 0), network(0, 1000)).success).toBe(false);
    const stop = firstStoppingSentries(network(200, 0));
    expect(stop).toBeGreaterThan(1);
    expect(intel(network(200, 0), network(0, stop - 1)).success).toBe(true);
    expect(intel(network(200, 0), network(0, stop)).success).toBe(false);
  });

  it('committing more turns adds force', () => {
    const attacker = network(200, 0);
    const stop = firstStoppingSentries(attacker, { turns: 1 });
    const committed = intel(attacker, network(0, stop), { turns: 5 });
    expect(committed.success).toBe(true);
    expect(committed.intelPercentage).toBeGreaterThan(0);
  });

  it('the whole spy force counts, however many are dispatched', () => {
    const attacker = network(200, 0);
    const stop = firstStoppingSentries(attacker);
    for (const sent of [1, 5, 10]) {
      expect(intel(attacker, network(0, stop - 1), { sent }).success).toBe(
        true,
      );
    }
  });

  it("today's spy pressure hardens a target, including a sentry-less one", () => {
    const attacker = network(200, 0);
    const stop = firstStoppingSentries(attacker);
    expect(intel(attacker, network(0, stop - 1)).success).toBe(true);
    expect(
      intel(attacker, network(0, stop - 1), { spyPressureToday: 64 }).success,
    ).toBe(false);
    expect(intel(network(5, 0), network(0, 0)).success).toBe(true);
    expect(
      intel(network(5, 0), network(0, 0), { spyPressureToday: 10_000 }).success,
    ).toBe(false);
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
