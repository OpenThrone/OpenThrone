import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpyService from '../SpyService';
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import type { UnitType } from '@/types/typings';
import { CITIZEN_WORKERS_TARGET } from '@/utils/spy/results';
import mtRand from '@/utils/mtrand';

describe('SpyService', () => {
  let attackerGenerator: MockUserGenerator;
  let defenderGenerator: MockUserGenerator;
  let attacker: UserModel;
  let defender: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock mtRand to return deterministic values for testing
    vi.doMock('@/utils/mtrand', () => ({
      default: vi.fn().mockImplementation((min: number, max: number) => min + 1), // Return min + 1 to ensure some randomness but positive
    }));

    attackerGenerator = new MockUserGenerator();
    attackerGenerator.setBasicInfo({ display_name: 'AttackerSpy', race: 'ELF', class: 'ASSASSIN' });
    attackerGenerator.setSpyUpgrade(5);
    attackerGenerator.addUnits([
      { type: 'SPY' as UnitType, level: 1, quantity: 10 },
      { type: 'SPY' as UnitType, level: 2, quantity: 10 },
      { type: 'SPY' as UnitType, level: 3, quantity: 1000 },
    ]);

    defenderGenerator = new MockUserGenerator();
    defenderGenerator.setBasicInfo({ display_name: 'DefenderSentry', race: 'HUMAN', class: 'WARRIOR' });
    defenderGenerator.setSentryUpgrade(1);
    defenderGenerator.addUnits([
      { type: 'SENTRY' as UnitType, level: 1, quantity: 5 },
      { type: 'CITIZEN' as UnitType, level: 1, quantity: 200 },
    ]);
    defenderGenerator.setFortLevel(1);
    defenderGenerator.setFortHitpoints(100);

    attacker = new UserModel(attackerGenerator.getUser());
    defender = new UserModel(defenderGenerator.getUser());
  });

  describe('simulateIntel', () => {
    it('succeeds when attacker.spy > defender.sentry', () => {
      const result = SpyService.simulateIntel(attacker, defender, 3);
      expect(result.success).toBe(true);
      expect(result.spiesLost).toBe(0);
    });

    it('fails when attacker.spy <= defender.sentry', () => {
      defenderGenerator.addUnits([{ type: 'SENTRY' as UnitType, level: 1, quantity: 100000 }]);
      defender = new UserModel(defenderGenerator.getUser());
      defender.updateStats();
      const result = SpyService.simulateIntel(attacker, defender, 3);
      expect(result.success).toBe(false);
      expect(result.spiesLost).toBe(3);
    });
  });

  describe('simulateAssassination', () => {
    it('kills units > 0 when success and target units present', () => {
      // Remove sentries to ensure full success and focus on target kill calculation
      defender.units = defender.units.filter(u => u.type !== 'SENTRY');
      defender.updateStats(); // Recalculate sentry = 0

      // Increase attacker assassins for higher strength
      const assassinUnit = attacker.units.find(u => u.type === 'SPY' && u.level === 3);
      if (assassinUnit) {
        assassinUnit.quantity = 1000;
      }
      attacker.updateStats();

      // Ensure target units
      const citizenUnit = defender.units.find(u => u.type === 'CITIZEN');
      if (citizenUnit) {
        citizenUnit.quantity = 200;
      }
      defender.updateStats();

      // Mock mtRand to return higher values for kill rate
      vi.spyOn(mtRand, 'default').mockImplementation(() => 0.9); // High value for effective KS

      const result = SpyService.simulateAssassination(attacker, defender, 200, CITIZEN_WORKERS_TARGET);
      expect(result.success).toBe(true);
      expect(result.unitsKilled).toBeGreaterThan(0);
    });
  });

  describe('simulateInfiltration', () => {
    it('causes fortDmg > 0 when success', () => {
      const initialFortHP = defender.fortHitpoints;
      const result = SpyService.simulateInfiltration(attacker, defender, 3);
      expect(result.success).toBe(true);
      expect(result.fortDmg).toBeGreaterThan(0);
      expect(defender.fortHitpoints).toBeLessThan(initialFortHP);
    });
  });
});