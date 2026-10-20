import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import {
  type BattleUserLike,
  calculateFortAdjustedPillageCapShare,
  calculateLoot,
  calculatePillageBudget,
  executeAttack,
  getProtectedLootMultiplier,
  type LootRaidContext,
} from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
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
  level = 20,
): BattleUserLike {
  return {
    id: type === 'OFFENSE' ? 1 : 2,
    level,
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

  it('a standing fort and a protected shield reduce a successful raid cap', () => {
    // Level 1 on both sides: full shield (0.1x) and a neutral gold-level modifier.
    const attacker = fighter('OFFENSE', 1000, 0n, 1);
    // Inside the protected allowance the whole treasury is shielded.
    const defender = fighter('DEFENSE', 100, 100_000n, 1);
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
    // Unprotected level-1 gold already pays the 0.8 level factor; the shield is 0.1.
    expect(protectedLoot).toBeLessThanOrEqual(standing / 8n + 1n);
  });

  it('shields only the protected allowance so a hoard is raided at the normal rate', () => {
    const attacker = fighter('OFFENSE', 1000, 0n, 1);
    const allowance = BigInt(V5_COMBAT_CONSTANTS.PROTECTED_GOLD_ALLOWANCE);
    const protectedRaid = {
      ...raid,
      fortHpPercent: 0.5,
      isDefenderProtected: true,
    };
    const lootFor = (gold: bigint, isProtected: boolean) =>
      calculateLoot(attacker, fighter('DEFENSE', 100, gold, 1), 10, () => 0.5, {
        ...protectedRaid,
        isDefenderProtected: isProtected,
      });
    const hoard = 1_000_000n;
    const shieldedLoot = lootFor(allowance, true);
    const hoardLoot = lootFor(hoard, true);
    const unprotectedHoardLoot = lootFor(hoard, false);

    // The allowance alone stays at a tenth of the full rate (0.8 level factor on unprotected level 1).
    expect(shieldedLoot).toBeLessThanOrEqual(
      lootFor(allowance, false) / 8n + 1n,
    );
    // A hoard pays out far more than a flat tenth of the unprotected rate...
    expect(hoardLoot).toBeGreaterThan(unprotectedHoardLoot / 2n);
    // ...but never more than the unprotected treasury would.
    expect(hoardLoot).toBeLessThan(unprotectedHoardLoot);
    // Budget agrees: protected budget = shielded slice + exposed slice.
    expect(calculatePillageBudget(hoard, 0.5, true)).toBeGreaterThan(
      calculatePillageBudget(hoard, 0.5, false) / 2n,
    );
    expect(calculatePillageBudget(allowance, 0.5, true)).toBe(
      calculatePillageBudget(allowance, 0.5, false) / 10n,
    );
  });

  it('tapers the shield multiplier linearly from 0.1 at level 1 to 1.0 at level 10', () => {
    expect(getProtectedLootMultiplier(1)).toBeCloseTo(0.1, 10);
    expect(getProtectedLootMultiplier(5)).toBeCloseTo(0.1 + (0.9 * 4) / 9, 10);
    expect(getProtectedLootMultiplier(9)).toBeCloseTo(0.9, 10);
    expect(getProtectedLootMultiplier(10)).toBeCloseTo(1, 10);
    expect(getProtectedLootMultiplier(30)).toBeCloseTo(1, 10);
    const allowance = BigInt(V5_COMBAT_CONSTANTS.PROTECTED_GOLD_ALLOWANCE);
    const budgetAt = (level: number) =>
      calculatePillageBudget(allowance, 0.5, true, level);
    expect(budgetAt(1)).toBeLessThan(budgetAt(5));
    expect(budgetAt(5)).toBeLessThan(budgetAt(9));
    expect(budgetAt(10)).toBe(calculatePillageBudget(allowance, 0.5, false));
    expect(calculateFortAdjustedPillageCapShare(0.5, true, 9)).toBeCloseTo(
      calculateFortAdjustedPillageCapShare(0.5, true, 1) * 9,
      10,
    );
  });

  it('pays protected defenders 80% of the exposed rate at every level 1-9', () => {
    // A treasury this large makes the shielded allowance negligible.
    const gold = 10n ** 15n;
    // Equal levels keep the gold-level modifier at 1, isolating the level factor.
    const loot = (level: number) => {
      const attacker = fighter('OFFENSE', 1000, 0n);
      attacker.level = level;
      const defender = fighter('DEFENSE', 100, gold);
      defender.level = level;
      return calculateLoot(attacker, defender, 10, () => 0.5, {
        ...raid,
        fortHpPercent: 0.5,
        isDefenderProtected: true,
      });
    };
    const full = loot(20);
    for (const level of [1, 5, 9]) {
      const ratio = Number((loot(level) * 10000n) / full) / 10000;
      expect(ratio).toBeGreaterThan(0.79);
      expect(ratio).toBeLessThan(0.81);
    }
  });

  it('a fully committed won assault pays the full cap share, not half', async () => {
    const defender = fighter('DEFENSE', 100, 10n ** 12n);
    defender.level = 20;
    const result = await executeAttack(
      fighter('OFFENSE', 10000, 0n),
      defender,
      10,
      false,
      { random: createSeededRandom('covered-turns') },
    );
    const budget = calculatePillageBudget(10n ** 12n, 0, false);
    // Five won assault turns each cover two committed turns, so the raid
    // reaches the fort-adjusted budget instead of stalling near half of it.
    expect(result.pillagedGold).toBeGreaterThan((budget * 8n) / 10n);
    expect(result.pillagedGold).toBeLessThanOrEqual(budget);
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
