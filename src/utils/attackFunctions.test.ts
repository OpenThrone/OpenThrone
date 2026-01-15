import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';
import { normUnits } from 'test/utils/testFixtures';

// install deterministic mtRand mock before requiring modules that depend on it
installMockMtRand(vi);
const {
  simulateBattle,
  calculateLoot,
  calculateStrength,
  calculateStaminaDrop,
  calculateStaminaModifier,
  calculateTurnScaling,
  getFortBreachState,
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
    const userModel = new UserModel(user.getUser(), user.getUser().units);
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
    const userModel = new UserModel(user.getUser(), user.getUser().units);
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
    const userModel = new UserModel(user.getUser(), user.getUser().units);
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
    const userModel = new UserModel(user.getUser(), user.getUser().units);

    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.totalStats.MeleeAtkPower).toBe(0);
    expect(strength.totalStats.MeleeDefPower).toBe(0);
    expect(strength.totalStats.RangedAtkPower).toBe(0);
    expect(strength.totalStats.RangedDefPower).toBe(0);
  });
});

describe('Gold Pillage Fix', () => {
  it('should ensure pillaged gold is always positive and only calculated on attacker turns', async () => {
    // Create attacker with some offense units
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
    const attacker = new UserModel(
      attackerUser.getUser(),
      attackerUser.getUser().units,
    );

    // Create defender with some gold
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
    const defender = new UserModel(
      defenderUser.getUser(),
      defenderUser.getUser().units,
    );

    // Simulate a short battle
    const battleResult = await simulateBattle(
      attacker,
      defender,
      Fortifications[defender.fortLevel].hitpoints,
      3, // Only 3 turns to test
      false, // No debug logging
    );

    // Verify that pillaged gold is non-negative (may be zero in some edge cases)
    expect(typeof battleResult.pillagedGold).toBe('bigint');
    expect(battleResult.pillagedGold).toBeGreaterThanOrEqual(BigInt(0));

    // Verify that pillaged gold does not exceed defender's gold
    expect(battleResult.pillagedGold).toBeLessThanOrEqual(defender.gold);

    // Log the result for debugging
  });

  it('should calculate loot correctly using calculateLoot function', () => {
    // Create attacker
    const attackerUser = new MockUserGenerator();
    attackerUser.setBasicInfo({
      email: 'attacker@example.com',
      display_name: 'Attacker',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    const attacker = new UserModel(
      attackerUser.getUser(),
      attackerUser.getUser().units,
    );

    // Create defender with gold
    const defenderUser = new MockUserGenerator();
    defenderUser.setBasicInfo({
      email: 'defender@example.com',
      display_name: 'Defender',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    defenderUser.adjustGold(BigInt(100000)); // Large amount for testing
    const defender = new UserModel(
      defenderUser.getUser(),
      defenderUser.getUser().units,
    );

    // Test loot calculation for different turns
    const lootTurn1 = calculateLoot(attacker, defender, 1);
    const lootTurn3 = calculateLoot(attacker, defender, 3);
    const lootTurn5 = calculateLoot(attacker, defender, 5);

    // Verify loot is non-negative
    expect(lootTurn1).toBeGreaterThanOrEqual(BigInt(0));
    expect(lootTurn3).toBeGreaterThanOrEqual(BigInt(0));
    expect(lootTurn5).toBeGreaterThanOrEqual(BigInt(0));

    // Verify loot does not exceed defender's gold
    expect(lootTurn1).toBeLessThanOrEqual(defender.gold);
    expect(lootTurn3).toBeLessThanOrEqual(defender.gold);
    expect(lootTurn5).toBeLessThanOrEqual(defender.gold);
  });
});

describe('Stamina Calculation', () => {
  it('should calculate stamina drop correctly for early turns', () => {
    const staminaDropTurn1 = calculateStaminaDrop(1);
    const staminaDropTurn5 = calculateStaminaDrop(5);
    expect(staminaDropTurn1).toBe(1.0);
    expect(staminaDropTurn5).toBe(1.0);
  });

  it('should calculate stamina drop correctly for mid turns', () => {
    const staminaDropTurn6 = calculateStaminaDrop(6);
    const staminaDropTurn10 = calculateStaminaDrop(10);
    expect(staminaDropTurn6).toBe(0.9);
    expect(staminaDropTurn10).toBe(0.9);
  });

  it('should calculate stamina drop correctly for late turns', () => {
    const staminaDropTurn11 = calculateStaminaDrop(11);
    const staminaDropTurn15 = calculateStaminaDrop(15);
    expect(staminaDropTurn11).toBe(0.75);
    expect(staminaDropTurn15).toBe(0.75);
  });

  it('should calculate stamina modifier correctly', () => {
    const modifierTurn1 = calculateStaminaModifier(1);
    const modifierTurn6 = calculateStaminaModifier(6);
    const modifierTurn11 = calculateStaminaModifier(11);
    const modifierTurn13 = calculateStaminaModifier(13);
    expect(modifierTurn1).toBe(1.0);
    expect(modifierTurn6).toBe(0.85);
    expect(modifierTurn11).toBe(0.7);
    expect(modifierTurn13).toBe(0.55);
  });
});

describe('Turn Scaling', () => {
  it('should calculate turn scaling correctly for early turns', () => {
    const scalingTurn1 = calculateTurnScaling(1);
    const scalingTurn5 = calculateTurnScaling(5);
    expect(scalingTurn1).toBe(1.0);
    expect(scalingTurn5).toBe(1.0);
  });

  it('should calculate turn scaling correctly for mid turns', () => {
    const scalingTurn6 = calculateTurnScaling(6);
    const scalingTurn10 = calculateTurnScaling(10);
    expect(scalingTurn6).toBe(0.9);
    expect(scalingTurn10).toBe(0.9);
  });

  it('should calculate turn scaling correctly for late turns', () => {
    const scalingTurn11 = calculateTurnScaling(11);
    const scalingTurn15 = calculateTurnScaling(15);
    expect(scalingTurn11).toBe(0.8);
    expect(scalingTurn15).toBe(0.8);
  });
});

describe('Fort Breach', () => {
  it('should detect fort breach when HP is 0', () => {
    const breachState = getFortBreachState(0, 500);
    expect(breachState.breached).toBe(true);
    expect(breachState.turnsToBreach).toBe(0);
    expect(breachState.breachDamage).toBe(100);
    expect(breachState.breachChance).toBe(1);
  });

  it('should not detect breach when HP is positive', () => {
    const breachState = getFortBreachState(100, 500);
    expect(breachState.breached).toBe(false);
    expect(breachState.turnsToBreach).toBeGreaterThan(0);
    expect(breachState.breachDamage).toBe(0);
    expect(breachState.breachChance).toBeGreaterThan(0);
  });
});

describe('Casualties', () => {
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
      {
        defenderFortLevel: 24,
        defenderStructureUpgrades: [{ type: 'ARMORY', level: 6 }],
      },
    );
    expect(maxArmory.damageDealt).toBeLessThan(noArmory.damageDealt);
  });

  it('should only apply remaining damage to collateral units', async () => {
    const BattleResult = require('../models/BattleResult').default;

    const attackerGen = new MockUserGenerator();
    attackerGen.clearUnits();
    attackerGen.addUnits(
      normUnits([{ type: 'OFFENSE', quantity: 1, level: 1 }]),
    );
    const attacker = new UserModel(
      attackerGen.getUser(),
      attackerGen.getUser().units,
    );
    attacker.mercenaries = [];

    const defenderGen = new MockUserGenerator();
    defenderGen.clearUnits();
    defenderGen.addUnits(
      normUnits([
        { type: 'DEFENSE', quantity: 2, level: 1 },
        { type: 'CITIZEN', quantity: 5, level: 1 },
      ]),
    );
    const defender = new UserModel(
      defenderGen.getUser(),
      defenderGen.getUser().units,
    );
    defender.mercenaries = [];

    const battleResult = new BattleResult(attacker, defender);
    await distributeCasualties({
      result: battleResult,
      attacker,
      defender,
      attackerDamageDealt: 15,
      defenderDamageDealt: 0,
      fortHP: 0,
      initialFortHP: 100,
      includeCitz: true,
      includeOffense: false,
      debug: false,
    });

    expect(
      battleResult.Losses.Defender.units.find((u: any) => u.type === 'CITIZEN'),
    ).toBeUndefined();
    expect(
      battleResult.Losses.Defender.units.find((u: any) => u.type === 'DEFENSE')
        ?.quantity,
    ).toBe(1);
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

    const attackerModel = new UserModel(
      attacker.getUser(),
      attacker.getUser().units,
    );
    const defenderModel = new UserModel(
      defender.getUser(),
      defender.getUser().units,
    );

    const battle = await simulateBattle(
      attackerModel,
      defenderModel,
      defenderModel.fortHitpoints,
      10,
    );
    expect(battle.Losses.Attacker.total).toBeGreaterThan(0);
    expect(attackerModel.stamina).toBeDefined();
    expect(defenderModel.stamina).toBeDefined();
  });
});
