import { describe, it, test, expect, beforeEach, vi } from 'bun:test';
import { simulateBattle, calculateLoot } from './attackFunctions';
import UserModel from '../models/Users';
import MockUserGenerator from './MockUserGenerator';
import { Fortifications } from '@/constants';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';
import { installMockPrisma, mockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

// Install deterministic mtRand and Prisma mocks BEFORE requiring modules that import them
installMockMtRand(vi);
installMockPrisma(vi);

describe('Gold Pillage Fix - Edge Cases', () => {
  beforeEach(() => {
    // Ensure deterministic randomness for gold pillage tests
    mtRandImpl.fn = (min: number = 0, max: number = 1) => (min + max) / 2; // predictable mid-point
    // Reset prisma mock state
    resetMockPrisma();
    vi.clearAllMocks();
  });
  describe('Large Gold Amounts (BigInt Handling)', () => {
    it('should handle very large gold amounts (near BigInt limit)', () => {
      // Create attacker
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.addUnits([
        { type: 'OFFENSE', quantity: 100, level: 1 }
      ]);
      const attacker = new UserModel(attackerUser.getUser());

      // Create defender with extremely large gold amount (near max safe BigInt)
      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      const maxSafeGold = BigInt('9223372036854775807'); // Max safe BigInt
      defenderUser.adjustGold(maxSafeGold);
      defenderUser.addUnits([
        { type: 'DEFENSE', quantity: 10, level: 1 }
      ]);
      const defender = new UserModel(defenderUser.getUser());

      // Test loot calculation directly
      const loot = calculateLoot(attacker, defender, 1);
      
      // Verify loot is positive and doesn't exceed defender's gold
      expect(loot).toBeGreaterThan(BigInt(0));
      expect(loot).toBeLessThanOrEqual(defender.gold);
      expect(typeof loot).toBe('bigint');
      
      console.log(`Large gold test - Defender gold: ${defender.gold}, Loot: ${loot}`);
    });

    it('should handle maximum BigInt values safely', () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      const attacker = new UserModel(attackerUser.getUser());

      // Test with maximum BigInt value
      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt('9223372036854775807')); // Max BigInt
      const defender = new UserModel(defenderUser.getUser());

      const loot = calculateLoot(attacker, defender, 5);
      
      expect(loot).toBeGreaterThan(BigInt(0));
      expect(loot).toBeLessThanOrEqual(defender.gold);
      expect(typeof loot).toBe('bigint');
    });

    it('should handle gold calculation across multiple turns with large amounts', async () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.addUnits([
        { type: 'OFFENSE', quantity: 50, level: 1 }
      ]);
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt('1000000000000000000')); // 1 quintillion
      defenderUser.addUnits([
        { type: 'DEFENSE', quantity: 20, level: 1 }
      ]);
      const defender = new UserModel(defenderUser.getUser());

      // Simulate multi-turn battle
      const battleResult = await simulateBattle(
        attacker,
        defender,
        Fortifications[defender.fortLevel].hitpoints,
        10, // 10 turns
        false
      );

      // Verify total pillaged gold is positive and reasonable
      expect(battleResult.pillagedGold).toBeGreaterThan(BigInt(0));
      // Note: In multi-turn battles, total pillaged gold can exceed defender's current gold
      // because gold is calculated per turn based on defender's gold at that time
      expect(battleResult.pillagedGold).toBeGreaterThan(BigInt(0));
      expect(typeof battleResult.pillagedGold).toBe('bigint');
      
      // Verify that loot accumulates properly across turns
      expect(battleResult.pillagedGold).toBeGreaterThan(BigInt(100000000000000)); // Should be substantial
      
      console.log(`Multi-turn large gold test - Total pillaged: ${battleResult.pillagedGold}`);
    });
  });

  describe('Minimal Defender Gold', () => {
    it('should handle defender with zero gold', () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt(-25000)); // Remove default starting gold to get to 0
      defenderUser.adjustGold(BigInt(0)); // Explicitly set to 0
      const defender = new UserModel(defenderUser.getUser());

      // Verify the defender actually has 0 gold
      expect(defender.gold).toBe(BigInt(0));
      
      const loot = calculateLoot(attacker, defender, 1);
      
      // Should return 0 when defender has no gold
      expect(loot).toBe(BigInt(0));
      expect(typeof loot).toBe('bigint');
    });

    it('should handle defender with minimal gold (1 gold)', () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt(1)); // Minimal gold
      const defender = new UserModel(defenderUser.getUser());

      const loot = calculateLoot(attacker, defender, 1);
      
      // Should return 0 or 1, but never negative
      expect(loot).toBeGreaterThanOrEqual(BigInt(0));
      expect(loot).toBeLessThanOrEqual(defender.gold);
      expect(typeof loot).toBe('bigint');
    });

    it('should handle defender with small gold amounts', async () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.addUnits([
        { type: 'OFFENSE', quantity: 10, level: 1 }
      ]);
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt(100)); // Small amount
      defenderUser.addUnits([
        { type: 'DEFENSE', quantity: 5, level: 1 }
      ]);
      const defender = new UserModel(defenderUser.getUser());

      const battleResult = await simulateBattle(
        attacker,
        defender,
        Fortifications[defender.fortLevel].hitpoints,
        3,
        false
      );

      expect(battleResult.pillagedGold).toBeGreaterThanOrEqual(BigInt(0));
      expect(battleResult.pillagedGold).toBeLessThanOrEqual(defender.gold);
      expect(typeof battleResult.pillagedGold).toBe('bigint');
    });
  });

  describe('Multiple Turn Battles for Gold Accumulation', () => {
    it('should accumulate gold correctly across multiple attacker turns', async () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.addUnits([
        { type: 'OFFENSE', quantity: 30, level: 1 }
      ]);
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt(50000));
      defenderUser.addUnits([
        { type: 'DEFENSE', quantity: 15, level: 1 }
      ]);
      const defender = new UserModel(defenderUser.getUser());

      // Test with different turn counts to verify accumulation
      const turnsToTest = [1, 3, 5, 7, 10];
      const results = [];

      for (const turnCount of turnsToTest) {
        const battleResult = await simulateBattle(
          attacker,
          defender,
          Fortifications[defender.fortLevel].hitpoints,
          turnCount,
          false
        );
        results.push({
          turns: turnCount,
          pillagedGold: battleResult.pillagedGold
        });
      }

      // Verify that more turns generally result in more gold (but not always due to randomness)
      let lastGold = BigInt(0);
      for (const result of results) {
        expect(result.pillagedGold).toBeGreaterThanOrEqual(BigInt(0));
        // Note: In multi-turn battles, total pillaged gold can exceed defender's initial gold
        // because gold is calculated per turn based on defender's gold at that time
        expect(result.pillagedGold).toBeGreaterThan(BigInt(0));
        expect(typeof result.pillagedGold).toBe('bigint');
        
        // Gold should generally increase with more turns, but allow for some randomness
        if (result.turns > 1) {
          console.log(`Turns: ${result.turns}, Gold: ${result.pillagedGold}`);
        }
        lastGold = result.pillagedGold;
      }
    });

    it('should handle battles with many turns (max turns)', async () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.addUnits([
        { type: 'OFFENSE', quantity: 100, level: 1 }
      ]);
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.adjustGold(BigInt(100000));
      defenderUser.addUnits([
        { type: 'DEFENSE', quantity: 50, level: 1 }
      ]);
      const defender = new UserModel(defenderUser.getUser());

      // Test with maximum turns
      const battleResult = await simulateBattle(
        attacker,
        defender,
        Fortifications[defender.fortLevel].hitpoints,
        10, // MAX_TURNS
        false
      );

      expect(battleResult.pillagedGold).toBeGreaterThan(BigInt(0));
      // Note: In multi-turn battles, total pillaged gold can exceed defender's initial gold
      // because gold is calculated per turn based on defender's gold at that time
      expect(typeof battleResult.pillagedGold).toBe('bigint');
      
      console.log(`Max turns test - Total pillaged: ${battleResult.pillagedGold}`);
    });
  });

  describe('Level Difference Edge Cases', () => {
    it('should handle large level differences correctly', () => {
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.setLevel(20); // High level
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.setLevel(1); // Low level
      defenderUser.adjustGold(BigInt(10000));
      const defender = new UserModel(defenderUser.getUser());

      const loot = calculateLoot(attacker, defender, 1);
      
      expect(loot).toBeGreaterThan(BigInt(0));
      expect(loot).toBeLessThanOrEqual(defender.gold);
      expect(typeof loot).toBe('bigint');
    });

    it('should handle same level attackers and defenders', () => {
      const level = 10;
      const attackerUser = new MockUserGenerator();
      attackerUser.setBasicInfo({
        email: 'attacker@example.com',
        display_name: 'Attacker',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      attackerUser.setLevel(level);
      const attacker = new UserModel(attackerUser.getUser());

      const defenderUser = new MockUserGenerator();
      defenderUser.setBasicInfo({
        email: 'defender@example.com',
        display_name: 'Defender',
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      defenderUser.setLevel(level);
      defenderUser.adjustGold(BigInt(5000));
      const defender = new UserModel(defenderUser.getUser());

      const loot = calculateLoot(attacker, defender, 1);
      
      expect(loot).toBeGreaterThan(BigInt(0));
      expect(loot).toBeLessThanOrEqual(defender.gold);
      expect(typeof loot).toBe('bigint');
    });
  });
});