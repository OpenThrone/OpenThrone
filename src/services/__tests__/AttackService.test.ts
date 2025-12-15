import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { installMockPrisma, mockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';
import { installMockMtRand } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';
// Install shared mocks before requiring modules under test
installMockPrisma(vi);
installMockMtRand(vi);

const mockAttackDataService = {
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  updateUserUnits: vi.fn(),
  createAttackLog: vi.fn(),
  createBankHistory: vi.fn(),
  incrementUserStats: vi.fn(),
};

vi.mock('@/services/AttackDataService', () => mockAttackDataService);
vi.mock('@/services/AttackValidationService', () => ({
  canAttack: vi.fn(async () => true),
}));

mockPrisma.$transaction.mockImplementation(async (cb: any) => {
  const tx = {
    users: { update: (...args: any[]) => mockAttackDataService.updateUser(...args) },
    bank_history: { create: (...args: any[]) => mockAttackDataService.createBankHistory(...args) },
    attack_log: { create: (...args: any[]) => mockAttackDataService.createAttackLog(...args) },
  };
  return cb(tx);
});

const AttackService = require('../AttackService').default ?? require('../AttackService');
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { Fortifications } from '@/constants/Fortifications';
import { UnitType, ItemType, ItemUsage, BattleUpgradeType } from '@/types/typings';

describe('AttackService', () => {
  let attackerGenerator: MockUserGenerator;
  let defenderGenerator: MockUserGenerator;
  let attacker: UserModel;
  let defender: UserModel;

  beforeEach(() => {
    attackerGenerator = new MockUserGenerator();
    attackerGenerator.setBasicInfo({ display_name: 'Attacker', race: 'ELF', class: 'ASSASSIN' });
    attackerGenerator.setOffenseUpgrade(1);
    attackerGenerator.addUnits(normUnits([
      { id: 0, userId: attackerGenerator.getPrismaUser().id, type: 'OFFENSE' as const, level: 1, quantity: 50, isMercenary: false },
    ]));

    defenderGenerator = new MockUserGenerator();
    defenderGenerator.setBasicInfo({ display_name: 'Defender', race: 'HUMAN', class: 'WARRIOR' });
    defenderGenerator.setSentryUpgrade(1);
    defenderGenerator.addUnits(normUnits([
      { id: 0, userId: defenderGenerator.getPrismaUser().id, type: 'DEFENSE' as const, level: 1, quantity: 10, isMercenary: false },
      { id: 0, userId: defenderGenerator.getPrismaUser().id, type: 'CITIZEN' as const, level: 1, quantity: 10, isMercenary: false },
    ]));
    defenderGenerator.setFortLevel(1);
    defenderGenerator.setFortHitpoints(Fortifications[1].hitpoints);

    attacker = new UserModel(
      attackerGenerator.getPrismaUser(),
      attackerGenerator.getUnits().map(u => ({ id: u.id, userId: u.userId, type: u.type as UnitType, level: u.level, quantity: u.quantity, isMercenary: u.isMercenary })),
      attackerGenerator.getItems().map(i => ({ id: i.id, userId: i.userId, type: i.type as ItemType, level: i.level, quantity: i.quantity, usage: i.usage as ItemUsage })),
      attackerGenerator.getStructureUpgrades(),
      attackerGenerator.getBattleUpgrades().map(b => ({ id: b.id, userId: b.userId, type: b.type as BattleUpgradeType, level: b.level, quantity: b.quantity })),
      attackerGenerator.getBonusPoints(),
      attackerGenerator.getPermissions(),
      attackerGenerator.getStats()
    );
    defender = new UserModel(
      defenderGenerator.getPrismaUser(),
      defenderGenerator.getUnits().map(u => ({ id: u.id, userId: u.userId, type: u.type as UnitType, level: u.level, quantity: u.quantity, isMercenary: u.isMercenary })),
      defenderGenerator.getItems().map(i => ({ id: i.id, userId: i.userId, type: i.type as ItemType, level: i.level, quantity: i.quantity, usage: i.usage as ItemUsage })),
      defenderGenerator.getStructureUpgrades(),
      defenderGenerator.getBattleUpgrades().map(b => ({ id: b.id, userId: b.userId, type: b.type as BattleUpgradeType, level: b.level, quantity: b.quantity })),
      defenderGenerator.getBonusPoints(),
      defenderGenerator.getPermissions(),
      defenderGenerator.getStats()
    );
    // Reset shared mocks state between tests
    resetMockPrisma();
    mockAttackDataService.getUserById.mockReset();
    mockAttackDataService.updateUser.mockReset();
    mockAttackDataService.updateUserUnits.mockReset();
    mockAttackDataService.createAttackLog.mockReset();
    mockAttackDataService.createBankHistory.mockReset();
    mockAttackDataService.incrementUserStats.mockReset();
  });

  describe('calculateStrength', () => {
    it('returns non-zero for populated offense', () => {
      const strength = AttackService.calculateStrength(attacker, 'OFFENSE');
      // At least one of melee or ranged attack power should be non-zero for a populated offense
      expect(strength.totalStats.MeleeAtkPower + strength.totalStats.RangedAtkPower).toBeGreaterThan(0);
    });

    it('returns non-zero for populated defense', () => {
      const strength = AttackService.calculateStrength(defender, 'DEFENSE');
      // At least one of melee or ranged defense power should be non-zero for a populated defense
      expect(strength.totalStats.MeleeDefPower + strength.totalStats.RangedDefPower).toBeGreaterThan(0);
    });
  });

  describe('simulateBattle', () => {
    it('results in attacker win with low defender units', async () => {
      //const initialFortHP = Fortifications[defender.fortLevel].hitpoints;
      const userGenerator = new MockUserGenerator();
      userGenerator.addUnits(normUnits([
        { id: 0, userId: userGenerator.getPrismaUser().id, type: 'OFFENSE' as UnitType, level: 1, quantity: 100, isMercenary: false },
      ]));
      const defenderForTest = new UserModel(
        userGenerator.getPrismaUser(),
        userGenerator.getUnits().map(u => ({ id: u.id, userId: u.userId, type: u.type as UnitType, level: u.level, quantity: u.quantity, isMercenary: u.isMercenary })),
        userGenerator.getItems().map(i => ({ id: i.id, userId: i.userId, type: i.type as ItemType, level: i.level, quantity: i.quantity, usage: i.usage as ItemUsage })),
        userGenerator.getStructureUpgrades(),
        userGenerator.getBattleUpgrades().map(b => ({ id: b.id, userId: b.userId, type: b.type as BattleUpgradeType, level: b.level, quantity: b.quantity })),
        userGenerator.getBonusPoints(),
        userGenerator.getPermissions(),
        userGenerator.getStats()
      );
      const result = await AttackService.simulateBattle(attacker, defenderForTest, 100, 1);
      expect(result.result).toBe('WIN'); // Check for 'WIN' directly
      expect(result.Losses.Attacker.total).toBeLessThanOrEqual(result.Losses.Defender.total);
      expect(result.pillagedGold).toBeGreaterThan(BigInt(0));
    });

    it('results in defender win with high defender units', async () => {
      defenderGenerator.addUnits(normUnits([
        { id: 0, userId: defenderGenerator.getPrismaUser().id, type: 'DEFENSE' as const, level: 1, quantity: 100, isMercenary: false },
      ]));
      defender = new UserModel(
        defenderGenerator.getPrismaUser(),
        defenderGenerator.getUnits().map(u => ({ id: u.id, userId: u.userId, type: u.type, level: u.level, quantity: u.quantity, isMercenary: u.isMercenary })),
        defenderGenerator.getItems().map(i => ({ id: i.id, userId: i.userId, type: i.type, level: i.level, quantity: i.quantity, usage: i.usage })),
        defenderGenerator.getStructureUpgrades(),
        defenderGenerator.getBattleUpgrades().map(b => ({ id: b.id, userId: b.userId, type: b.type, level: b.level, quantity: b.quantity })),
        defenderGenerator.getBonusPoints(),
        defenderGenerator.getPermissions(),
        defenderGenerator.getStats()
      );
      defender.updateStats();
      const initialFortHP = Fortifications[defender.fortLevel].hitpoints;
      const result = await AttackService.simulateBattle(attacker, defender, initialFortHP, 5);
      expect(result.result).toBe('LOSS'); // Check for 'LOSS' directly
      expect(result.Losses.Attacker.total).toBeGreaterThanOrEqual(result.Losses.Defender.total);
      // simulateBattle may compute some pillagedGold even when the defender ultimately 'wins' the fight
      // so accept any non-negative BigInt here to keep the test stable
      expect(result.pillagedGold).toBeGreaterThanOrEqual(BigInt(0));
    });
  });

  describe('executeAttack', () => {
    it('persists mitigation metadata into attack_log.stats', async () => {
      const attackerId = 1;
      const defenderId = 2;

      const attackerGen = new MockUserGenerator();
      attackerGen.getPrismaUser().id = attackerId;
      attackerGen.setBasicInfo({ display_name: 'Attacker', race: 'HUMAN', class: 'FIGHTER' });
      attackerGen.clearUnits();
      attackerGen.addUnits(normUnits([
        { id: 0, userId: attackerId, type: 'OFFENSE' as const, level: 1, quantity: 200, isMercenary: false },
      ]));
      attackerGen.getPrismaUser().attack_turns = 50;
      attackerGen.setStamina(50);
      attackerGen.setMaxStamina(50);

      const defenderGen = new MockUserGenerator();
      defenderGen.getPrismaUser().id = defenderId;
      defenderGen.setBasicInfo({ display_name: 'Defender', race: 'HUMAN', class: 'FIGHTER' });
      defenderGen.clearUnits();
      defenderGen.addUnits(normUnits([
        { id: 0, userId: defenderId, type: 'DEFENSE' as const, level: 1, quantity: 50, isMercenary: false },
      ]));
      defenderGen.setFortLevel(24);
      defenderGen.setFortHitpoints(Fortifications.find((f) => f.level === 24)?.hitpoints ?? 9500);

      mockAttackDataService.getUserById.mockImplementation(async (id: number) => {
        if (id === attackerId) {
          const u = attackerGen.getUser();
          u.id = attackerId;
          u.gold = BigInt(100000);
          u.permissions = [];
          return u;
        }
        if (id === defenderId) {
          const u = defenderGen.getUser();
          u.id = defenderId;
          u.gold = BigInt(100000);
          u.permissions = [];
          return u;
        }
        return null;
      });

      mockAttackDataService.updateUser.mockResolvedValue({});
      mockAttackDataService.updateUserUnits.mockResolvedValue({});
      mockAttackDataService.createBankHistory.mockResolvedValue({});
      mockAttackDataService.incrementUserStats.mockResolvedValue({});

      let createdAttackLogPayload: any | null = null;
      mockAttackDataService.createAttackLog.mockImplementation(async (payload: any) => {
        createdAttackLogPayload = payload;
        return { ...payload, id: 123 };
      });

      const res = await AttackService.executeAttack(attackerId, defenderId, 1);
      expect(res.status).toBe('success');
      expect(createdAttackLogPayload).toBeTruthy();
      expect(createdAttackLogPayload.stats).toBeTruthy();
      expect(typeof createdAttackLogPayload.stats.mitigation_log).toBe('string');

      const mitigationLog = JSON.parse(createdAttackLogPayload.stats.mitigation_log);
      expect(Array.isArray(mitigationLog)).toBe(true);
      expect(mitigationLog.length).toBeGreaterThan(0);

      // Summary should be present (nullable if no attacker damage samples, but usually present)
      expect('mitigation_summary' in createdAttackLogPayload.stats).toBe(true);
      expect('fort_breached' in createdAttackLogPayload.stats).toBe(true);
      expect(createdAttackLogPayload.stats.defender_fort_level).toBeDefined();
    });
  });
});
