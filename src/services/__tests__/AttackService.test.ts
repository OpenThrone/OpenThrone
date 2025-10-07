import AttackService from '../AttackService';
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { Fortifications } from '@/constants/Fortifications';

describe('AttackService', () => {
  let attackerGenerator: MockUserGenerator;
  let defenderGenerator: MockUserGenerator;
  let attacker: UserModel;
  let defender: UserModel;

  beforeEach(() => {
    attackerGenerator = new MockUserGenerator();
    attackerGenerator.setBasicInfo({ display_name: 'Attacker', race: 'ELF', class: 'ASSASSIN' });
    attackerGenerator.setOffenseUpgrade(1);
    attackerGenerator.addUnits([
      { type: 'OFFENSE' as const, level: 1, quantity: 50 },
    ]);

    defenderGenerator = new MockUserGenerator();
    defenderGenerator.setBasicInfo({ display_name: 'Defender', race: 'HUMAN', class: 'WARRIOR' });
    defenderGenerator.setSentryUpgrade(1);
    defenderGenerator.addUnits([
      { type: 'DEFENSE' as const, level: 1, quantity: 20 },
      { type: 'CITIZEN' as const, level: 1, quantity: 20 },
    ]);
    defenderGenerator.setFortLevel(1);
    defenderGenerator.setFortHitpoints(Fortifications[1].hitpoints);

    attacker = new UserModel(attackerGenerator.getUser());
    defender = new UserModel(defenderGenerator.getUser());
  });

  describe('calculateStrength', () => {
    it('returns non-zero for populated offense', () => {
      const strength = AttackService.calculateStrength(attacker, 'OFFENSE');
      expect(strength.MeleeAtkPower).toBeGreaterThan(0);
      expect(strength.RangedAtkPower).toBeGreaterThan(0);
    });

    it('returns non-zero for populated defense', () => {
      const strength = AttackService.calculateStrength(defender, 'DEFENSE');
      expect(strength.MeleeDefPower).toBeGreaterThan(0);
      expect(strength.RangedDefPower).toBeGreaterThan(0);
    });
  });

  describe('simulateBattle', () => {
    it('results in attacker win with low defender units', async () => {
      const initialFortHP = Fortifications[defender.fortLevel].hitpoints;
      const result = await AttackService.simulateBattle(attacker, defender, initialFortHP, 5);
      expect(result.result).toBe('win');
      expect(result.Losses.Attacker.total).toBeLessThan(result.Losses.Defender.total);
      expect(result.pillagedGold).toBeGreaterThan(BigInt(0));
    });

    it('results in defender win with high defender units', async () => {
      defenderGenerator.addUnits([
        { type: 'DEFENSE' as const, level: 1, quantity: 100 },
      ]);
      defender = new UserModel(defenderGenerator.getUser());
      defender.updateStats();
      const initialFortHP = Fortifications[defender.fortLevel].hitpoints;
      const result = await AttackService.simulateBattle(attacker, defender, initialFortHP, 5);
      expect(result.result).toBe('loss');
      expect(result.Losses.Attacker.total).toBeGreaterThan(result.Losses.Defender.total);
      expect(result.pillagedGold).toBe(BigInt(0));
    });
  });
});