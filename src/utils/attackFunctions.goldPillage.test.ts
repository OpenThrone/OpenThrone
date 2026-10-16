import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import {
  type BattleUserLike,
  calculateFortAdjustedPillageCapShare,
  calculateLoot,
  executeAttack,
  type LootRaidContext,
} from '@/utils/attackFunctions';
import { createSeededRandom } from '@/utils/random';

beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    random!() * (max - min) + min) as typeof mtRandImpl.fn;
});

const raid: LootRaidContext = {
  assaultSucceeded: true,
  attackPressure: 50000,
  defensePressure: 1000,
  fortHpPercent: 0,
};

function fighter(
  type: 'OFFENSE' | 'DEFENSE',
  count: number,
  gold: bigint,
): BattleUserLike {
  return {
    id: type === 'OFFENSE' ? 1 : 2,
    level: 20,
    race: 'ALL',
    fortLevel: 1,
    fortHitpoints: 0,
    gold,
    units: [
      { id: 1, userId: 1, type, level: 1, quantity: count, isMercenary: false },
    ],
    mercenaries: [],
    items: [],
    structure_upgrades: [],
    battle_upgrades: [],
  };
}

describe('exact bounded raid gold', () => {
  it('denies all extraction unless pressure won an assault', () => {
    const attacker = fighter('OFFENSE', 100, 0n);
    const defender = fighter('DEFENSE', 2000, 10n ** 30n);
    expect(
      calculateLoot(attacker, defender, 10, () => 0.5, {
        ...raid,
        assaultSucceeded: false,
      }),
    ).toBe(0n);
    expect(
      calculateLoot(attacker, defender, 10, () => 0.5, {
        ...raid,
        attackPressure: 1000,
        defensePressure: 2000,
      }),
    ).toBe(0n);
    expect(
      calculateLoot(attacker, defender, 10, () => 0.5, {
        ...raid,
        attackPressure: 2000,
        defensePressure: 2000,
      }),
    ).toBe(0n);
  });

  it('caps arbitrarily large balances using an integer share without Number conversion', () => {
    const defender = fighter('DEFENSE', 100, 10n ** 40n + 123456789n);
    // A top roll on a fully covered 10-turn assault earns exactly the cap.
    const loot = calculateLoot(
      fighter('OFFENSE', 1000, 0n),
      defender,
      10,
      () => 1,
      raid,
    );
    const cap =
      (defender.gold! *
        BigInt(
          Math.floor(calculateFortAdjustedPillageCapShare(0) * 1_000_000_000),
        )) /
      1_000_000_000n;
    expect(loot).toBe(cap);
  });

  it('never rounds a tiny treasury up or invents gold in an empty treasury', () => {
    const attacker = fighter('OFFENSE', 1000, 0n);
    expect(
      calculateLoot(attacker, fighter('DEFENSE', 100, 0n), 10, () => 0.5, raid),
    ).toBe(0n);
    expect(
      calculateLoot(attacker, fighter('DEFENSE', 100, 1n), 10, () => 0.5, raid),
    ).toBe(0n);
  });

  it('a standing fort and protected target reduce a successful raid cap', () => {
    const attacker = fighter('OFFENSE', 1000, 0n);
    const defender = fighter('DEFENSE', 100, 100000000n);
    const breached = calculateLoot(attacker, defender, 10, () => 0.5, raid);
    const standing = calculateLoot(attacker, defender, 10, () => 0.5, {
      ...raid,
      fortHpPercent: 1,
    });
    const protectedLoot = calculateLoot(attacker, defender, 10, () => 0.5, {
      ...raid,
      fortHpPercent: 1,
      isDefenderProtected: true,
    });
    expect(standing).toBeLessThan(breached);
    expect(protectedLoot).toBeLessThanOrEqual(standing / 10n);
  });

  it('deducts exactly the engine result once and honors the daily allowance over all phases', async () => {
    const attacker = fighter('OFFENSE', 10000, 19n);
    const startingGold = 10n ** 25n + 11n;
    const defender = fighter('DEFENSE', 100, startingGold);
    const result = await executeAttack(attacker, defender, 10, false, {
      random: createSeededRandom('bigint-conservation'),
      defenderDailyGoldRemaining: 123457n,
    });
    expect(result.pillagedGold).toBe(123457n);
    expect(defender.gold).toBe(startingGold - result.pillagedGold);
    // Persistence owns the receiver's transfer, not the engine.
    expect(attacker.gold).toBe(19n);
    expect(result.result).toBe('WIN');
  });

  it('zero daily allowance forbids gold even after successful assaults', async () => {
    const defender = fighter('DEFENSE', 100, 1000000n);
    const result = await executeAttack(
      fighter('OFFENSE', 10000, 0n),
      defender,
      10,
      false,
      {
        random: createSeededRandom('zero-allowance'),
        defenderDailyGoldRemaining: 0n,
      },
    );
    expect(result.canonicalOutcome?.assaultSucceeded).toBe(true);
    expect(result.pillagedGold).toBe(0n);
    expect(defender.gold).toBe(1000000n);
  });

  it('denies pillage extraction when Archer ranged support holds against melee assault', async () => {
    const attacker: BattleUserLike = {
      id: 1,
      level: 20,
      race: 'HUMAN',
      fortLevel: 8,
      fortHitpoints: 500,
      gold: 0n,
      units: [
        {
          id: 1,
          userId: 1,
          type: 'OFFENSE',
          level: 2,
          quantity: 100,
          isMercenary: false,
        },
      ],
      mercenaries: [],
      items: [],
      structure_upgrades: [],
      battle_upgrades: [],
    };
    const defender: BattleUserLike = {
      id: 2,
      level: 20,
      race: 'HUMAN',
      fortLevel: 8,
      fortHitpoints: 500,
      gold: 1_000_000n,
      units: [
        {
          id: 2,
          userId: 2,
          type: 'DEFENSE',
          level: 2,
          quantity: 150,
          isMercenary: false,
        },
      ],
      mercenaries: [],
      items: [],
      structure_upgrades: [],
      battle_upgrades: [],
    };

    const result = await executeAttack(attacker, defender, 1, false, {
      random: () => 0.5,
    });

    expect(result.canonicalOutcome?.assaultSucceeded).toBe(false);
    expect(result.pillagedGold).toBe(0n);
    expect(defender.gold).toBe(1_000_000n);
  });
});
