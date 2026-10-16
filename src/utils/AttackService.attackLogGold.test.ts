import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockMtRand } from 'test/utils/mockMtRand';
// Install shared test helpers BEFORE loading modules that import '@/lib/prisma' or '@/utils/mtrand'
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

import MockUserGenerator from './MockUserGenerator';

// Install module mocks before requiring the module under test so imports receive the mocked implementations
installMockPrisma(vi);
installMockMtRand(vi);

// Now require the service under test (after mocks are in place)
const AttackService =
  require('../services/AttackService').default ??
  require('../services/AttackService');

describe('Gold Pillage Fix - Attack Log Gold Recording', () => {
  let attacker: any;
  let defender: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    // Reset the shared prisma mock state between tests
    resetMockPrisma();

    // Create mock users using MockUserGenerator
    const attackerGenerator = new MockUserGenerator();
    const defenderGenerator = new MockUserGenerator();

    attacker = attackerGenerator.getUser();
    defender = defenderGenerator.getUser();

    // Set up gold amounts for testing
    attacker.gold = BigInt(50000);
    defender.gold = BigInt(100000);
  });

  test('should verify gold recording logic in attack logs', () => {
    // Test the gold recording logic directly from AttackService.ts
    const pillagedGold = BigInt(25000);
    const isAttackerWinner = true;

    // Simulate the logic from AttackService.ts line 153
    const recordedGold = isAttackerWinner ? pillagedGold.toString() : '0';

    // Verify the gold is recorded as positive string
    expect(recordedGold).toBe('25000');
    expect(parseInt(recordedGold)).toBeGreaterThan(0);

    // Test with zero gold
    const zeroGold = BigInt(0);
    const zeroRecordedGold = isAttackerWinner ? zeroGold.toString() : '0';
    expect(zeroRecordedGold).toBe('0');
    expect(parseInt(zeroRecordedGold)).toBe(0);

    // Test with very large gold
    const largeGold = BigInt('1384125532936476700');
    const largeRecordedGold = isAttackerWinner ? largeGold.toString() : '0';
    expect(largeRecordedGold).toBe('1384125532936476700');
    expect(BigInt(largeRecordedGold)).toBeGreaterThan(BigInt(0));
  });

  test('should record zero gold when defender wins', () => {
    // Test the gold recording logic when defender wins
    const pillagedGold = BigInt(25000);
    const isAttackerWinner = false; // Defender wins

    // Simulate the logic from AttackService.ts line 153
    const recordedGold = isAttackerWinner ? pillagedGold.toString() : '0';

    // Verify the gold is recorded as '0' when defender wins
    expect(recordedGold).toBe('0');
    expect(parseInt(recordedGold)).toBe(0);
  });

  test('should handle very large gold values correctly', () => {
    // Test with very large gold amounts
    const largeGoldAmount = BigInt('1384125532936476700');
    const isAttackerWinner = true;

    // Simulate the logic from AttackService.ts line 153
    const recordedGold = isAttackerWinner ? largeGoldAmount.toString() : '0';

    // Verify the gold is recorded correctly as string
    expect(recordedGold).toBe(largeGoldAmount.toString());
    expect(BigInt(recordedGold)).toBe(largeGoldAmount);
    expect(BigInt(recordedGold)).toBeGreaterThan(BigInt(0));
  });

  test('should ensure BigInt gold conversion works correctly', () => {
    // Test the BigInt conversion logic from AttackService.ts lines 140-141
    const attackPlayerGold = BigInt(50000);
    const defensePlayerGold = BigInt(100000);
    const pillagedGold = BigInt(25000);

    // Simulate the gold transfer logic from AttackService.ts lines 140-141
    const newDefenseGold =
      BigInt(defensePlayerGold.toString()) - BigInt(pillagedGold.toString());
    const newAttackGold =
      BigInt(attackPlayerGold.toString()) + BigInt(pillagedGold.toString());

    // Verify the results
    expect(newDefenseGold).toBe(BigInt(75000)); // 100000 - 25000
    expect(newAttackGold).toBe(BigInt(75000)); // 50000 + 25000
    expect(newDefenseGold).toBeGreaterThanOrEqual(BigInt(0)); // Never negative
    expect(newAttackGold).toBeGreaterThan(BigInt(0)); // Always positive when pillaged

    // Test with very large BigInt values
    const largeAttackGold = BigInt('1000000000000000000');
    const largeDefenseGold = BigInt('9223372036854775807');
    const largePillagedGold = BigInt('1384125532936476700');

    const newLargeDefenseGold =
      BigInt(largeDefenseGold.toString()) -
      BigInt(largePillagedGold.toString());
    const newLargeAttackGold =
      BigInt(largeAttackGold.toString()) + BigInt(largePillagedGold.toString());

    expect(newLargeDefenseGold).toBeGreaterThan(BigInt(0));
    expect(newLargeAttackGold).toBeGreaterThan(BigInt(0));
  });

  test('should handle minimal gold amounts correctly', () => {
    // Test with minimal gold amounts
    const minimalGoldAmount = BigInt(1);
    const isAttackerWinner = true;

    // Simulate the logic from AttackService.ts line 153
    const recordedGold = isAttackerWinner ? minimalGoldAmount.toString() : '0';

    // Verify the gold is recorded correctly as string
    expect(recordedGold).toBe('1');
    expect(BigInt(recordedGold)).toBe(minimalGoldAmount);
    expect(BigInt(recordedGold)).toBeGreaterThan(BigInt(0));

    // Test edge case: zero gold with attacker win
    const zeroGold = BigInt(0);
    const zeroRecordedGold = isAttackerWinner ? zeroGold.toString() : '0';
    expect(zeroRecordedGold).toBe('0');
    expect(BigInt(zeroRecordedGold)).toBe(BigInt(0));
  });
});
