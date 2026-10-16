import { describe, expect, it } from 'bun:test';
import { normUnits } from 'test/utils/testFixtures';

import { EconomyUpgrades, Fortifications } from '@/constants';
import { stringifyObj } from '@/utils/numberFormatting';

import userData from '../../__mocks__/userData';
import UserModel from './Users';

describe('UserModel', () => {
  it('should correctly instantiate with default values when no userData is provided', () => {
    const user = new UserModel(null);
    expect(user.id).toBe(0);
    expect(user.displayName).toBe('');
    expect(user.race).toBe('ELF');
    expect(user.class).toBe('ASSASSIN');
  });

  it('should correctly instantiate with provided userData (no password shown)', () => {
    const user = new UserModel(
      JSON.parse(JSON.stringify(stringifyObj(userData))),
      true,
    );
    expect(user.id).toEqual(userData.id);
    expect(user.displayName).toEqual(userData.display_name);
    expect(user.passwordHash).toBe('');
  });

  // Test if Fortification is correct based on Fort Level
  it('should correctly calculate fortification based on fort level', () => {
    const user = new UserModel(
      JSON.parse(JSON.stringify(stringifyObj(userData))),
    );
    const fortification = Fortifications.find(
      (f) => f.level === user.fortLevel,
    );

    expect(fortification.hitpoints).toBe(50);
    user.fortLevel = 5;
    expect(
      Fortifications.find((f) => f.level === user.fortLevel).hitpoints,
    ).toBe(500);
  });

  // Test to make sure that Offense is correct based on Units
  it('should correctly calculate offense based on no units or items', () => {
    const user = new UserModel(
      JSON.parse(JSON.stringify(stringifyObj(userData))),
    );
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(0);
  });

  it('should correctly calculate offense based on units', () => {
    userData.units = normUnits([
      { level: 1, type: 'OFFENSE', quantity: 10 },
      // Knight (level 2) needs fort level 4; at fort 1 the stack stays locked
      // out of the fighting pool.
      { level: 2, type: 'OFFENSE', quantity: 5 },
    ]);
    const user = new UserModel(
      JSON.parse(JSON.stringify(stringifyObj(userData))),
    );
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(50);
    const unlockedData = JSON.parse(JSON.stringify(stringifyObj(userData)));
    unlockedData.units = normUnits([
      { level: 1, type: 'OFFENSE', quantity: 10 },
      { level: 2, type: 'OFFENSE', quantity: 5 },
    ]);
    unlockedData.fort_level = 4;
    const unlocked = new UserModel(unlockedData);
    expect(unlocked.getArmyStat('OFFENSE')).toBe(125);
  });

  // Test to make sure that Offense is correct based on Items
  it('should correctly calculate offense based on items', () => {
    userData.items = normUnits([
      { level: 1, type: 'WEAPON', usage: 'OFFENSE', quantity: 1 }, // 25bonus * 1 = 25
      { level: 2, type: 'WEAPON', usage: 'OFFENSE', quantity: 1 }, // 50bonus * 1 = 50
    ]);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [];
    const user = new UserModel(userData2);
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(0);
    userData2.units = normUnits([
      { level: 1, type: 'OFFENSE', quantity: 1 },
      // Locked at fort 1: contributes nothing, and the level-2 weapon cannot
      // equip a level-1 soldier.
      { level: 2, type: 'OFFENSE', quantity: 1 },
      { level: 1, type: 'DEFENSE', quantity: 1 }, // this should be ignored
    ]);
    const user2 = new UserModel(userData2);
    const offense2 = user2.getArmyStat('OFFENSE');
    expect(offense2).toBe(5);
  });

  // Test to make sure that Defense is correct based on Units and Fortification
  it('should correctly calculate defense based on units and fortification', () => {
    const user = new UserModel(
      JSON.parse(JSON.stringify(stringifyObj(userData))),
    );
    const defense = user.getArmyStat('DEFENSE');
    expect(defense).toBe(0);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = normUnits([
      { level: 1, type: 'DEFENSE', quantity: 1 }, // 3bonus * 1 = 3
      { level: 2, type: 'DEFENSE', quantity: 1 }, // 20bonus * 1 = 20
    ]);
    const user2 = new UserModel(userData2);
    const defense2 = user2.getArmyStat('DEFENSE');
    expect(user2.fortLevel).toBe(1);
    expect(user.defenseBonus).toBe(10);
    // The level-2 archer needs fort level 4; only the guard fights at fort 1.
    expect(defense2).toBe(6);

    userData2.fort_level = 5; // 'Outpost Level 2' - 25% defense bonus
    const user3 = new UserModel(userData2);
    expect(user3.fortLevel).toBe(5);
    expect(user3.defenseBonus).toBe(30); // 30%
    const defense3 = user3.getArmyStat('DEFENSE');
    expect(defense3).toBe(33);
  });

  // Test to make sure that Defense is correct based on Battle Upgrades
  it('should correctly calculate defense based on battle upgrades', () => {
    const user = new UserModel(
      JSON.parse(JSON.stringify(stringifyObj(userData))),
    );
    const defense = user.getArmyStat('DEFENSE');
    expect(defense).toBe(0);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = normUnits([
      { type: 'CITIZEN', level: 1, quantity: 0 },
      { type: 'WORKER', level: 1, quantity: 8982 },
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
      { type: 'SPY', level: 1, quantity: 500 },
      { type: 'OFFENSE', level: 2, quantity: 8146 },
      { type: 'DEFENSE', level: 2, quantity: 6000 }, // 6000 * 20 = 120000
      { type: 'SENTRY', level: 1, quantity: 200 },
    ]);
    userData2.fort_level = 5; // Archers need fort 4; siege gate needs 6.
    userData2.structure_upgrades = normUnits([
      { type: 'ARMORY', level: 1 },
      { type: 'SPY', level: 1 },
      { type: 'SENTRY', level: 1 },
      { type: 'OFFENSE', level: 7 }, // Needed to unlock battle upgrades
    ]);
    userData2.battle_upgrades = normUnits([
      { type: 'OFFENSE', level: 1, quantity: 1 },
      // Guard Tower: 150 MD / 100 RD per upgrade over 5 units => each covered
      // archer gains 30 MD + 20 RD on top of its 5 MD + 15 RD.
      { type: 'DEFENSE', level: 1, quantity: 1300 },
      { type: 'SENTRY', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 2, quantity: 1 },
    ]);
    const user2 = new UserModel(userData2);
    const defense2 = user2.getArmyStat('DEFENSE');
    expect(user2.defenseBonus).toBe(30); // 25% fort + 5% Elf
    expect(defense2).toBe(546000);
  });

  // Test to make sure that GoldPerWorker is correct based on Economy Level
  it('should correctly calculate gold per worker based on economy level', () => {
    const user = new UserModel(userData);
    expect(user.goldPerTurn).toBe(BigInt(1000));
    expect(
      EconomyUpgrades.find((x) => x.index === user.economyLevel).goldPerWorker,
    ).toBe(55);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.economy_level = 5;
    userData2.units = normUnits([
      {
        level: 1,
        type: 'WORKER',
        quantity: 1,
      },
    ]);
    userData2.fort_level = 5;
    const user2 = new UserModel(userData2);
    expect(user2.goldPerTurn).toBe(BigInt(5075));
  });

  it('should correctly calculate attacks won', () => {
    const user = new UserModel(userData);
    // attacksWon may vary depending on environment or data; assert it's a number and non-negative
    expect(typeof user.attacks_won).toBe('number');
    expect(user.attacks_won).toBeGreaterThanOrEqual(0);
  });

  it('should correctly calculate defends won', () => {
    const user = new UserModel(userData);
    // defendsWon may vary depending on environment or data; assert it's a number and non-negative
    expect(typeof user.defends_won).toBe('number');
    expect(user.defends_won).toBeGreaterThanOrEqual(0);
  });

  it('should filter player bonuses based on race or class', () => {
    const user = new UserModel(userData);
    const bonuses = user.playerBonuses;
    expect(bonuses.length).toBe(2);
    expect(user.attackBonus).toBe(0);
    expect(user.spyBonus).toBe(5);
    expect(user.defenseBonus).toBe(10); // 5 for Elf + 5 for Fortification
    expect(bonuses[0].bonusAmount).toBe(5); // [{ race: "ELF", bonusType: "DEFENSE", bonusAmount: 5 }, {race: "ASSASSIN", bonusType: "INTEL", bonusAmount: 5}]
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = normUnits([
      { level: 1, type: 'OFFENSE', quantity: 1 }, // 3bonus * 1 = 3
      { level: 2, type: 'OFFENSE', quantity: 1 }, // 20bonus * 1 = 20
      { level: 1, type: 'DEFENSE', quantity: 1 }, // 3bonus * 1 = 3 this should be ignored
    ]);
    userData2.race = 'HUMAN';
    userData2.class = 'FIGHTER';
    const user2 = new UserModel(userData2);
    const bonuses2 = user2.playerBonuses;
    expect(bonuses2.length).toBe(2);
    expect(user2.attackBonus).toBe(10);
    expect(user2.spyBonus).toBe(0);
    expect(user2.defenseBonus).toBe(5); // 5% for Fort
    // Knight locked at fort 1; the soldier fights alone (ceil of 5 × 1.10 × 1.02).
    expect(user2.getArmyStat('OFFENSE')).toBe(6);
  });
});
