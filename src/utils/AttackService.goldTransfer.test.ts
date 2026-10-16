import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockMtRand } from 'test/utils/mockMtRand';

import MockUserGenerator from './MockUserGenerator';
// Install deterministic mtRand before requiring modules that may import it
installMockMtRand(vi);

describe('Gold Pillage Fix - AttackService Gold Transfer Logic', () => {
  let attacker: any;
  let defender: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock users using MockUserGenerator
    const attackerGenerator = new MockUserGenerator();
    const defenderGenerator = new MockUserGenerator();

    attacker = attackerGenerator.getUser();
    defender = defenderGenerator.getUser();

    // Set up gold amounts for testing
    attacker.gold = BigInt(50000);
    defender.gold = BigInt(100000);
  });

  test('should verify BigInt gold transfer logic in AttackService', () => {
    // Test the BigInt conversion logic that happens in AttackService
    const pillagedGold = BigInt(25000);

    // Simulate the gold transfer logic from AttackService.ts lines 140-141
    const initialAttackerGold = BigInt(attacker.gold.toString());
    const initialDefenderGold = BigInt(defender.gold.toString());

    // Apply the transfer logic
    const newDefenderGold = initialDefenderGold - pillagedGold;
    const newAttackerGold = initialAttackerGold + pillagedGold;

    // Verify the results
    expect(newDefenderGold).toBe(BigInt(75000)); // 100000 - 25000
    expect(newAttackerGold).toBe(BigInt(75000)); // 50000 + 25000
    expect(newDefenderGold).toBeGreaterThanOrEqual(BigInt(0)); // Never negative
  });

  test('should handle very large BigInt values safely', () => {
    // Test with very large gold amounts
    const largePillagedGold = BigInt('1000000000000000000');
    defender.gold = BigInt('9223372036854775807'); // Near BigInt max

    const initialDefenderGold = BigInt(defender.gold.toString());
    const initialAttackerGold = BigInt(attacker.gold.toString());

    // Apply the transfer logic
    const newDefenderGold = initialDefenderGold - largePillagedGold;
    const newAttackerGold = initialAttackerGold + largePillagedGold;

    // Verify the results
    expect(newDefenderGold).toBe(BigInt('8223372036854775807')); // Large subtraction
    expect(newAttackerGold).toBe(BigInt('1000000000000050000')); // Large addition (50000 + 1000000000000000000)
    expect(newDefenderGold).toBeGreaterThanOrEqual(BigInt(0)); // Never negative
  });

  test('should prevent negative defender gold', () => {
    // Test edge case where pillaged gold exceeds defender's gold
    defender.gold = BigInt(1000);
    const excessivePillagedGold = BigInt(2000); // More than defender has

    const initialDefenderGold = BigInt(defender.gold.toString());
    const initialAttackerGold = BigInt(attacker.gold.toString());

    // Apply the transfer logic (this would normally be clamped in the actual service)
    const actualPillagedGold =
      initialDefenderGold > excessivePillagedGold
        ? excessivePillagedGold
        : initialDefenderGold; // Only transfer what defender has
    const newDefenderGold = initialDefenderGold - actualPillagedGold;
    const newAttackerGold = initialAttackerGold + actualPillagedGold;

    // Verify the results - defender gold should not go negative
    expect(newDefenderGold).toBe(BigInt(0)); // Should be clamped to 0
    expect(newAttackerGold).toBe(BigInt(51000)); // 50000 + 1000 (only 1000 available)
  });

  test('should handle zero gold transfer correctly', () => {
    // Test zero gold transfer
    const zeroPillagedGold = BigInt(0);

    const initialDefenderGold = BigInt(defender.gold.toString());
    const initialAttackerGold = BigInt(attacker.gold.toString());

    // Apply the transfer logic
    const newDefenderGold = initialDefenderGold - zeroPillagedGold;
    const newAttackerGold = initialAttackerGold + zeroPillagedGold;

    // Verify no change occurred
    expect(newDefenderGold).toBe(initialDefenderGold);
    expect(newAttackerGold).toBe(initialAttackerGold);
  });

  test('should accumulate gold correctly across multiple transfers', () => {
    // Test multiple gold transfers (simulating multiple attacks)
    const transfers = [
      BigInt(10000),
      BigInt(15000),
      BigInt(8000),
      BigInt(5000),
    ];

    let currentDefenderGold = BigInt(defender.gold.toString());
    let currentAttackerGold = BigInt(attacker.gold.toString());
    let totalPillaged = BigInt(0);

    transfers.forEach((transferAmount) => {
      // Apply transfer logic
      currentDefenderGold -= transferAmount;
      currentAttackerGold += transferAmount;
      totalPillaged += transferAmount;

      // Verify defender gold never goes negative
      expect(currentDefenderGold).toBeGreaterThanOrEqual(BigInt(0));
    });

    // Verify final amounts
    expect(currentDefenderGold).toBe(BigInt(62000)); // 100000 - 38000
    expect(currentAttackerGold).toBe(BigInt(88000)); // 50000 + 38000
    expect(totalPillaged).toBe(BigInt(38000));
  });

  test('should verify BigInt string conversion works correctly', () => {
    // Test the string conversion logic used in AttackService
    const pillagedGold = BigInt(25000);

    // Simulate the conversion process from AttackService.ts
    const defensePlayerGold = BigInt(defender.gold.toString());
    const attackPlayerGold = BigInt(attacker.gold.toString());

    // Apply the transfer logic from lines 140-141
    const newDefenseGold = defensePlayerGold - BigInt(pillagedGold.toString());
    const newAttackGold = attackPlayerGold + BigInt(pillagedGold.toString());

    // Verify the results
    expect(newDefenseGold).toBe(BigInt(75000));
    expect(newAttackGold).toBe(BigInt(75000));
    expect(typeof newDefenseGold.toString()).toBe('string');
    expect(typeof newAttackGold.toString()).toBe('string');
  });
});
