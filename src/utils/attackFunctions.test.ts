import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';

// install deterministic mtRand mock before requiring modules that depend on it
installMockMtRand(vi);
const {
  simulateBattle,
  calculateLoot,
  calculateStrength,
  resetBattleConstants,
  setBattleConstants,
  newComputeCasualties,
  distributeCasualties,
} = require('./attackFunctions');
const UserModel = require('../models/Users').default;
const MockUserGenerator = require('./MockUserGenerator').default;
const { Fortifications } = require('@/constants');

const user = new MockUserGenerator();

beforeEach(() => {
  // stable RNG for tests (high value to avoid zero-strength/loot edge-cases)
  mtRandImpl.fn = () => 0.9;
  vi.clearAllMocks();
});
user.setBasicInfo({
  email: 'test@example.com',
  display_name: 'Test User',
  race: 'HUMAN',
  class: 'FIGHTER',
});
describe('calculateStrength', () => {
  it('should calculate the strength for offense units', () => {
    user.clearItems();
    user.clearUnits();
    user.addUnits(
      normUnits([
        { type: 'OFFENSE', quantity: 5, level: 1 },
        { type: 'DEFENSE', quantity: 10, level: 1 },
      ]),
    );
    user.addItems(
      normUnits([
        { type: 'WEAPON', level: 1, usage: 'OFFENSE', quantity: 2 },
        { type: 'WEAPON', level: 2, usage: 'OFFENSE', quantity: 1 },
        { type: 'HELM', level: 1, usage: 'OFFENSE', quantity: 1 },
      ]),
    );
    const userModel = new UserModel(user.getUser());
    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.totalStats.MeleeAtkPower).toBeGreaterThan(0);
    expect(strength.totalStats.MeleeDefPower).toBeGreaterThan(0);
    // Ranged values may be zero for these setups; assert non-negative
    expect(strength.totalStats.RangedAtkPower).toBeGreaterThanOrEqual(0);
    expect(strength.totalStats.RangedDefPower).toBeGreaterThanOrEqual(0);
  });

  it('should calculate the strength for defense units', () => {
    user.clearItems();
    user.clearUnits();
    user.addUnits(
      normUnits([
        { type: 'OFFENSE', quantity: 5, level: 1 },
        { type: 'DEFENSE', quantity: 10, level: 1 },
      ]),
    );
    user.addItems(
      normUnits([
        { type: 'WEAPON', level: 1, usage: 'DEFENSE', quantity: 2 },
        { type: 'WEAPON', level: 2, usage: 'DEFENSE', quantity: 1 },
        { type: 'HELM', level: 1, usage: 'DEFENSE', quantity: 1 },
      ]),
    );
    const userModel = new UserModel(user.getUser());
    const strength = calculateStrength(userModel, 'DEFENSE');
    expect(strength.totalStats.MeleeAtkPower).toBeGreaterThan(0);
    expect(strength.totalStats.MeleeDefPower).toBeGreaterThan(0);
    // Ranged values may be zero for these setups; assert non-negative
    expect(strength.totalStats.RangedAtkPower).toBeGreaterThanOrEqual(0);
    expect(strength.totalStats.RangedDefPower).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty units and items', () => {
    user.clearItems();
    user.clearUnits();
    user.clearBattleUpgrades();
    user.addUnits(normUnits([]));
    user.addItems([]);
    const userModel = new UserModel(user.getUser());
    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.totalStats.MeleeAtkPower).toBe(0);
    expect(strength.totalStats.MeleeDefPower).toBe(0);
    expect(strength.totalStats.RangedAtkPower).toBe(0);
    expect(strength.totalStats.RangedDefPower).toBe(0);
  });

  it('should handle completely empty user', () => {
    user.clearItems();
    user.clearUnits();
    user.clearBattleUpgrades();
    const userModel = new UserModel(user.getUser());

    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.totalStats.MeleeAtkPower).toBe(0);
    expect(strength.totalStats.MeleeDefPower).toBe(0);
    expect(strength.totalStats.RangedAtkPower).toBe(0);
    expect(strength.totalStats.RangedDefPower).toBe(0);
  });

  it('should gate battle upgrades behind siege level', () => {
    const combatUser = {
      id: 1001,
      attackBonus: 0,
      defenseBonus: 0,
      units: normUnits([{ type: 'DEFENSE', quantity: 10, level: 2 }]),
      mercenaries: [],
      items: [],
      battle_upgrades: normUnits([{ type: 'DEFENSE', level: 1, quantity: 2 }]),
      structure_upgrades: normUnits([{ type: 'OFFENSE', level: 5 }]),
    };

    const strength = calculateStrength(combatUser, 'DEFENSE');

    expect(strength.upgradeStats.MeleeDefPower).toBe(0);
    expect(strength.upgradeStats.RangedAtkPower).toBe(0);
    expect(strength.upgradeStats.RangedDefPower).toBe(0);
  });

  it('should apply battle upgrades only to covered eligible units', () => {
    const combatUser = {
      id: 1002,
      attackBonus: 0,
      defenseBonus: 0,
      units: normUnits([{ type: 'DEFENSE', quantity: 9, level: 2 }]),
      mercenaries: [],
      items: [],
      battle_upgrades: normUnits([{ type: 'DEFENSE', level: 1, quantity: 2 }]),
      structure_upgrades: normUnits([{ type: 'OFFENSE', level: 6 }]),
    };

    const strength = calculateStrength(combatUser, 'DEFENSE');

    expect(strength.upgradeStats.MeleeDefPower).toBe(270);
    expect(strength.upgradeStats.RangedAtkPower).toBe(90);
    expect(strength.upgradeStats.RangedDefPower).toBe(180);
  });

  it('should not apply battle upgrades to units below the minimum level', () => {
    const combatUser = {
      id: 1003,
      attackBonus: 0,
      defenseBonus: 0,
      units: normUnits([{ type: 'DEFENSE', quantity: 10, level: 1 }]),
      mercenaries: [],
      items: [],
      battle_upgrades: normUnits([{ type: 'DEFENSE', level: 1, quantity: 2 }]),
      structure_upgrades: normUnits([{ type: 'OFFENSE', level: 6 }]),
    };

    const strength = calculateStrength(combatUser, 'DEFENSE');

    expect(strength.upgradeStats.MeleeDefPower).toBe(0);
    expect(strength.upgradeStats.RangedAtkPower).toBe(0);
    expect(strength.upgradeStats.RangedDefPower).toBe(0);
  });
});

describe('Gold Pillage Fix', () => {
  it('should ensure pillaged gold is always positive and only calculated on attacker turns', async () => {
    const attackerUser = new MockUserGenerator();
    attackerUser.setBasicInfo({
      email: 'attacker@example.com',
      display_name: 'Attacker',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    attackerUser.addUnits(
      normUnits([{ type: 'OFFENSE', quantity: 10, level: 1 }]),
    );
    const attacker = new UserModel(attackerUser.getUser());

    const defenderUser = new MockUserGenerator();
    defenderUser.setBasicInfo({
      email: 'defender@example.com',
      display_name: 'Defender',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    defenderUser.adjustGold(BigInt(50000)); // Significant amount to pillage
    defenderUser.addUnits(
      normUnits([{ type: 'DEFENSE', quantity: 5, level: 1 }]),
    );
    const defender = new UserModel(defenderUser.getUser());

    const battleResult = await simulateBattle(
      attacker,
      defender,
      Fortifications[defender.fortLevel].hitpoints,
      3, // Only 3 turns to test
      false, // No debug logging
      false,
      { random: () => 0.5 },
    );

    expect(typeof battleResult.pillagedGold).toBe('bigint');
    expect(battleResult.pillagedGold).toBeGreaterThanOrEqual(BigInt(0));

    expect(battleResult.pillagedGold).toBeLessThanOrEqual(defender.gold);
  });

  it('should respect battle-constant pillage cap overrides', () => {
    const attacker = {
      level: 20,
      race: 'HUMAN',
    };
    const defender = {
      level: 20,
      fortLevel: 0,
      fortHitpoints: 0,
      gold: BigInt(1000000),
      units: normUnits([{ type: 'DEFENSE', quantity: 1, level: 1 }]),
      mercenaries: [],
    };

    try {
      setBattleConstants({ MAX_PILLAGE_SHARE_PER_ATTACK: 0.005 });
      const loot = calculateLoot(attacker, defender, 10, () => 0.99, {
        assaultSucceeded: true,
        attackPressure: 1000,
        defensePressure: 1,
        fortHpPercent: 0,
      });

      // Linear loot never exceeds the override cap; the mocked roll in this
      // suite scales the share below it.
      expect(loot).toBeLessThanOrEqual(BigInt(5000));
      expect(loot).toBeGreaterThan(BigInt(0));
    } finally {
      resetBattleConstants();
    }
  });
});

describe('Casualties', () => {
  // Issue #200: hopeless assaults (battle #23555, ~0.11 atk/def) kept chipping guards.
  describe('assault chip-damage taper', () => {
    const assault = (atk: number, def: number, taper: boolean) =>
      newComputeCasualties(
        atk,
        def,
        0,
        0,
        0,
        atk / def,
        undefined,
        false,
        false,
        false,
        taper ? { taperChipDamage: true } : undefined,
      ).rawDamageDealt;

    it('removes chip damage when the attack is far below defense', () => {
      expect(assault(3256, 28588, true)).toBe(0);
      expect(assault(3256, 28588, false)).toBe(Math.ceil(3256 * 0.05));
    });

    it('scales chip damage between the taper ratios', () => {
      expect(assault(500, 1000, true)).toBe(Math.ceil(500 * 0.05 * 0.5));
    });

    it('keeps the full floor at or above the taper end ratio', () => {
      expect(assault(800, 1000, true)).toBe(assault(800, 1000, false));
      expect(assault(2000, 1000, true)).toBe(assault(2000, 1000, false));
    });
  });

  it('should compute casualties with unequal strength', () => {
    const result = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      2.0,
      1000,
      false,
      false,
    );
    expect(result.damageDealt).toBeGreaterThan(0);
  });

  it('should compute higher casualties for overwhelming attacker', () => {
    const result1 = newComputeCasualties(
      5000,
      500,
      20000,
      20000,
      1000,
      10.0,
      0,
      true,
      false,
    );
    const result2 = newComputeCasualties(
      5000,
      500,
      20000,
      20000,
      1000,
      10.0,
      1000,
      true,
      false,
    );
    expect(result1.damageDealt).toBeGreaterThan(result2.damageDealt);
  });

  it('should compute casualties with fort reduction', () => {
    const resultWithFort = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      2.0,
      1000,
      false,
      false,
    );
    const resultWithoutFort = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      2.0,
      0,
      false,
      false,
    );
    expect(resultWithoutFort.damageDealt).toBeGreaterThan(
      resultWithFort.damageDealt,
    );
  });

  it('should apply fort casualty mitigation scaling by fort level and HP', () => {
    const noMitigation = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      1.0,
      1000,
      false,
      false,
      false,
      { defenderFortLevel: 1 },
    );
    const highFortFullHp = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      1.0,
      1000,
      false,
      false,
      false,
      { defenderFortLevel: 24 },
    );
    const highFortLowHp = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      1.0,
      100,
      false,
      false,
      false,
      { defenderFortLevel: 24 },
    );
    expect(highFortFullHp.damageDealt).toBeLessThan(noMitigation.damageDealt);
    expect(highFortLowHp.damageDealt).toBeGreaterThan(
      highFortFullHp.damageDealt,
    );
  });

  it('should apply structure upgrade mitigation (armory) even when fort is breached', () => {
    const noArmory = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      1.0,
      0,
      false,
      false,
      false,
      {
        defenderFortLevel: 24,
        defenderStructureUpgrades: [{ type: 'ARMORY', level: 1 }],
      },
    );
    const maxArmory = newComputeCasualties(
      2000,
      1000,
      10000,
      10000,
      1000,
      1.0,
      0,
      false,
      false,
      false,
      {
        defenderFortLevel: 24,
        defenderStructureUpgrades: [{ type: 'ARMORY', level: 6 }],
      },
    );
    expect(maxArmory.damageDealt).toBeLessThan(noArmory.damageDealt);
  });

  it('should expose collateral to remaining breach casualty budget', async () => {
    const BattleResult = require('../models/BattleResult').default;

    const attackerGen = new MockUserGenerator();
    attackerGen.clearUnits();
    attackerGen.addUnits(
      normUnits([{ type: 'OFFENSE', quantity: 1, level: 1 }]),
    );
    const attacker = new UserModel(attackerGen.getUser());
    attacker.mercenaries = [];

    const defenderGen = new MockUserGenerator();
    defenderGen.clearUnits();
    defenderGen.addUnits(
      normUnits([
        { type: 'DEFENSE', quantity: 1, level: 1 },
        { type: 'CITIZEN', quantity: 1000, level: 1 },
      ]),
    );
    const defender = new UserModel(defenderGen.getUser());
    defender.mercenaries = [];
    defender.houseLevel = 6;

    const battleResult = new BattleResult(attacker, defender);
    await distributeCasualties({
      result: battleResult,
      attacker,
      defender,
      attackerDamageDealt: 100000,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      includeCitz: true,
      includeOffense: false,
    });

    expect(
      battleResult.Losses.Defender.units.find((u: any) => u.type === 'CITIZEN'),
    ).toBeDefined();
    // The per-stack cap floors at one unit, so the lone guard can fall but
    // the remaining damage still spills into the collateral budget.
    const guardLoss = battleResult.Losses.Defender.units.find(
      (u: { type: string }) => u.type === 'DEFENSE',
    );
    expect(guardLoss?.quantity ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('Integration Tests with Updated Mock', () => {
  it('should simulate battle with stamina checks', async () => {
    const attacker = new MockUserGenerator();
    attacker.setBasicInfo({
      email: 'attacker@test.com',
      display_name: 'Attacker',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    attacker.setStamina(100);
    attacker.setMaxStamina(100);
    attacker.addUnits(
      normUnits([{ type: 'OFFENSE', level: 1, quantity: 1000 }]),
    );

    const defender = new MockUserGenerator();
    defender.setBasicInfo({
      email: 'defender@test.com',
      display_name: 'Defender',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    defender.setStamina(100);
    defender.setMaxStamina(100);
    defender.addUnits(
      normUnits([{ type: 'DEFENSE', level: 1, quantity: 1000 }]),
    );
    defender.setFortHitpoints(500);

    const attackerModel = new UserModel(attacker.getUser());
    const defenderModel = new UserModel(defender.getUser());

    const battle = await simulateBattle(
      attackerModel,
      defenderModel,
      defenderModel.fortHitpoints,
      10,
      false,
      false,
      { random: () => 0.5 },
    );
    expect(battle.Losses.Attacker.total).toBeGreaterThan(0);
    expect(attackerModel.stamina).toBeDefined();
    expect(defenderModel.stamina).toBeDefined();
  });
});
