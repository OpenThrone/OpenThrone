import { stringifyObj } from '@/utils/numberFormatting';
import UserModel from './Users';
import { EconomyUpgrades, Fortifications } from '@/constants';
import userData from '../../__mocks__/userData';

describe('UserModel', () => {
  

  it('should correctly instantiate with default values when no userData is provided', () => {
    const user = new UserModel(null);
    expect(user.id).toBe(0);
    expect(user.displayName).toBe('');
    expect(user.race).toBe('ELF');
    expect(user.class).toBe('ASSASSIN');
  });

  it('should correctly instantiate with provided userData (no password shown)', () => {
    const user = new UserModel(JSON.parse(JSON.stringify(stringifyObj(userData))), true);
    expect(user.id).toEqual(userData.id);
    expect(user.displayName).toEqual(userData.display_name);
    expect(user.passwordHash).toBe('');
  });

  //Test if Fortification is correct based on Fort Level
  it('should correctly calculate fortification based on fort level', () => {
    const user = new UserModel(JSON.parse(JSON.stringify(stringifyObj(userData))));
    const fortification = Fortifications.find(f => f.level === user.fortLevel);

    expect(fortification.hitpoints).toBe(50);
    user.fortLevel = 5;
    expect(Fortifications.find(f => f.level === user.fortLevel).hitpoints).toBe(500);
  });

  //Test to make sure that Offense is correct based on Units
  it('should correctly calculate offense based on no units or items', () => {
    const user = new UserModel(JSON.parse(JSON.stringify(stringifyObj(userData))));
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(0);
  });

  it('should correctly calculate offense based on units', () => {
    userData.units = [
      { level: 1, type: 'OFFENSE', quantity: 10 }, //3bonus * 10 = 30
      { level: 2, type: 'OFFENSE', quantity: 5 }, //20bonus * 5 = 100
    ];
    const user = new UserModel(JSON.parse(JSON.stringify(stringifyObj(userData))));
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(130);
  });

  //Test to make sure that Offense is correct based on Items
  it('should correctly calculate offense based on items', () => {
    userData.items = [
      { level: 1, type: 'WEAPON', usage: "OFFENSE", quantity: 1 }, //25bonus * 1 = 25
      { level: 2, type: 'WEAPON', usage: "OFFENSE", quantity: 1 }, //50bonus * 1 = 50
    ];
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [];
    const user = new UserModel(userData2);
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(0);
    userData2.units = [
      { level: 1, type: 'OFFENSE', quantity: 1 }, //3bonus * 1 = 3
      { level: 2, type: 'OFFENSE', quantity: 1 }, //20bonus * 1 = 20
      { level: 1, type: 'DEFENSE', quantity: 1 }, //3bonus * 1 = 3 this should be ignored
    ];
    const user2 = new UserModel(userData2);
    const offense2 = user2.getArmyStat('OFFENSE');
    expect(offense2).toBe(23 + 75);
  });

  //Test to make sure that Defense is correct based on Units and Fortification
  it('should correctly calculate defense based on units and fortification', () => {
    const user = new UserModel(JSON.parse(JSON.stringify(stringifyObj(userData))));
    const defense = user.getArmyStat('DEFENSE');
    expect(defense).toBe(0);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [
      { level: 1, type: 'DEFENSE', quantity: 1 }, //3bonus * 1 = 3
      { level: 2, type: 'DEFENSE', quantity: 1 }, //20bonus * 1 = 20
    ];
    const user2 = new UserModel(userData2);
    const defense2 = user2.getArmyStat('DEFENSE');
    expect(user2.fortLevel).toBe(1);
    expect(user.defenseBonus).toBe(10);
    expect(defense2).toBe(26);

    userData2.fort_level = 5; //'Outpost Level 2' - 25% defense bonus
    const user3 = new UserModel(userData2);
    expect(user3.fortLevel).toBe(5);
    expect(user3.defenseBonus).toBe(30); // 30%
    const defense3 = user3.getArmyStat('DEFENSE');
    expect(defense3).toBe(30); // 30% of 23 = 7 (rounded) + 23 = 30
  });

  //Test to make sure that Defense is correct based on Battle Upgrades
  it('should correctly calculate defense based on battle upgrades', () => {
    const user = new UserModel(JSON.parse(JSON.stringify(stringifyObj(userData))));
    const defense = user.getArmyStat('DEFENSE');
    expect(defense).toBe(0);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [
      { "type": "CITIZEN", "level": 1, "quantity": 0 },
      { "type": "WORKER", "level": 1, "quantity": 8982 },
      { "type": "OFFENSE", "level": 1, "quantity": 0 },
      { "type": "DEFENSE", "level": 1, "quantity": 0 },
      { "type": "SPY", "level": 1, "quantity": 500 },
      { "type": "OFFENSE", "level": 2, "quantity": 8146 },
      { "type": "DEFENSE", "level": 2, "quantity": 6000 }, // 6000 * 20 = 120000
      { "type": "SENTRY", "level": 1, "quantity": 200 }
    ];
    userData2.structure_upgrades = [
      { "type": "ARMORY", "level": 1 },
      { "type": "SPY", "level": 1 },
      { "type": "SENTRY", "level": 1 },
      { "type": "OFFENSE", "level": 7 } // Needed to unlock battle upgrades
    ];
    userData2.battle_upgrades = [
      { "type": "OFFENSE", "level": 1, "quantity": 1 },
      { "type": "DEFENSE", "level": 1, "quantity": 1300 }, // 6000units / 5unitsCovered = 1200; (1200 * (5*200)) = 1200000 
      { "type": "SENTRY", "level": 1, "quantity": 0 },
      { "type": "OFFENSE", "level": 2, "quantity": 1 }];
    const user2 = new UserModel(userData2);
    const defense2 = user2.getArmyStat('DEFENSE');
    expect(user2.defenseBonus).toBe(10);
    expect(defense2).toBe(Math.ceil((120000 + 1200000)*1.1)); // 120000 + 1200000 = 1320000 * 1.1 = 1452000
  });

  //Test to make sure that GoldPerWorker is correct based on Economy Level
  it('should correctly calculate gold per worker based on economy level', () => {
    const user = new UserModel(userData);
    expect(user.goldPerTurn).toBe(BigInt(1000));
    expect(EconomyUpgrades.find(x => x.index === user.economyLevel).goldPerWorker).toBe(55);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.economy_level = 5;
    userData2.units = [{
      level: 1,
      type: 'WORKER',
      quantity: 1,
    }]
    userData2.fort_level = 5;
    const user2 = new UserModel(userData2);
    expect(user2.goldPerTurn).toBe(BigInt(5075));
  });

  it('should correctly calculate attacks won', () => {
    const user = new UserModel(userData);
    expect(user.attacksWon).toBe(10);
  });

  it('should correctly calculate defends won', () => {
    const user = new UserModel(userData);
    expect(user.defendsWon).toBe(5);
  });

  it('should filter player bonuses based on race or class', () => {
    const user = new UserModel(userData);
    const bonuses = user.playerBonuses;
    expect(bonuses.length).toBe(2);
    expect(user.attackBonus).toBe(0);
    expect(user.spyBonus).toBe(5);
    expect(user.defenseBonus).toBe(10); // 5 for Elf + 5 for Fortification
    expect(bonuses[0].bonusAmount).toBe(5); //[{ race: "ELF", bonusType: "DEFENSE", bonusAmount: 5 }, {race: "ASSASSIN", bonusType: "INTEL", bonusAmount: 5}]
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [
      { level: 1, type: 'OFFENSE', quantity: 1 }, //3bonus * 1 = 3
      { level: 2, type: 'OFFENSE', quantity: 1 }, //20bonus * 1 = 20
      { level: 1, type: 'DEFENSE', quantity: 1 }, //3bonus * 1 = 3 this should be ignored
    ];
    userData2.race = "HUMAN";
    userData2.class = "FIGHTER";
    const user2 = new UserModel(userData2);
    const bonuses2 = user2.playerBonuses;
    expect(bonuses2.length).toBe(2);
    expect(user2.attackBonus).toBe(10);
    expect(user2.spyBonus).toBe(0);
    expect(user2.defenseBonus).toBe(5); //5% for Fort
    expect(user2.getArmyStat('OFFENSE')).toBe(108);
  });

  it('should correctly calculate offense based on Revs Units', () => {
    userData.units = [
      {
        "type": "CITIZEN",
        "level": 1,
        "quantity": 0
      },
      {
        "type": "WORKER",
        "level": 1,
        "quantity": 27500
      },
      {
        "type": "OFFENSE",
        "level": 1,
        "quantity": 0
      },
      {
        "type": "DEFENSE",
        "level": 1,
        "quantity": 641
      },
      {
        "type": "DEFENSE",
        "level": 2,
        "quantity": 12890
      },
      {
        "type": "DEFENSE",
        "level": 3,
        "quantity": 0
      },
      {
        "type": "SPY",
        "level": 1,
        "quantity": 1300
      },
      {
        "type": "SENTRY",
        "level": 1,
        "quantity": 1500
      },
      {
        "type": "OFFENSE",
        "level": 2,
        "quantity": 10365 // 10365 * 20 = 207300
      },
      {
        "type": "OFFENSE",
        "level": 3,
        "quantity": 7759 // 7759 * 50 = 387950
      }
    ];
    const userDataUnits = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userDataUnits.items = [];
    userDataUnits.structure_upgrades = [{ "type": "ARMORY", "level": 1 }, { "type": "SPY", "level": 1 }, { "type": "SENTRY", "level": 1 }, { "type": "OFFENSE", "level": 1 }];
    userDataUnits.battle_upgrades = [{ "type": "OFFENSE", "level": 1, "quantity": 0 },{ "type": "OFFENSE", "level": 2, "quantity": 0 }];
    userDataUnits.bonus_points = [{ "type": "OFFENSE", "level": 0 }];
    const user = new UserModel(userDataUnits);
    const offense = user.getArmyStat('OFFENSE');
    expect(offense).toBe(595250); 
    
    const userDataWithItems = JSON.parse(JSON.stringify(stringifyObj(userDataUnits)));
    userDataWithItems.items = [
      {
        "type": "WEAPON",
        "level": 2,
        "usage": "OFFENSE",
        "quantity": 20000 // 18124 * 50 = 906200
      },
      {
        "type": "HELM",
        "level": 2,
        "usage": "OFFENSE",
        "quantity": 20000 // 12 * 18124 = 217488
      },
      {
        "type": "BRACERS",
        "level": 2,
        "usage": "OFFENSE",
        "quantity": 20000 // 5 * 18124 = 90620
      },
      {
        "type": "SHIELD",
        "level": 2,
        "usage": "OFFENSE",
        "quantity": 20000 // 25 * 18124 = 453100
      },
      {
        "type": "BOOTS",
        "level": 2,
        "usage": "OFFENSE",
        "quantity": 20000 // 12 * 18124 = 217488
      },
      {
        "type": "ARMOR",
        "level": 2,
        "usage": "OFFENSE",
        "quantity": 20000 // 38 * 18124 = 688712
      },
    ];

    const user2 = new UserModel(userDataWithItems);
    const offense2 = user2.getArmyStat('OFFENSE');
    expect(offense2).toBe(595250 + (906200 + 217488 + 90620 + 453100 + 217488 + 688712));  // 595250 + 2573608 = 3168858
    
    const userDataWithBattleUpgrades = JSON.parse(JSON.stringify(stringifyObj(userDataWithItems)));
    userDataWithBattleUpgrades.battle_upgrades = [{
      "type": "OFFENSE", "level": 1, "quantity": 15539 // 200 * 15539 = 3107800
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
    }];

    const user3 = new UserModel(userDataWithBattleUpgrades);
    const offense3 = user3.getArmyStat('OFFENSE');

    expect(offense3).toBe(6276658);  // 3168858 + 3107800 = 6276658

    const userDataWithBonusPoints = JSON.parse(JSON.stringify(stringifyObj(userDataWithBattleUpgrades)));
    userDataWithBonusPoints.bonus_points = [{ "type": "OFFENSE", "level": 24 }];
    userDataWithBonusPoints.battle_upgrades = [{
      "type": "OFFENSE", "level": 1, "quantity": 15539 // 200 * 15539 = 3107800
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
      }];
    userDataWithBonusPoints.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];

    const user4 = new UserModel(userDataWithBonusPoints);
    const offense4 = user4.getArmyStat('OFFENSE');
    expect(offense4).toBe(Math.ceil(6276658 + (6276658 * .54))); 

    // Convert 1 Level 2 Offense unit to a Level 3 Offense unit
    userDataWithBonusPoints.bonus_points = [{ "type": "OFFENSE", "level": 24 }];
    userDataWithBonusPoints.battle_upgrades = [{
      "type": "OFFENSE", "level": 1, "quantity": 15539 // 200 * 15539 = 3107800
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
    }];
    userDataWithBonusPoints.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];
    const userDataWithConversion = JSON.parse(JSON.stringify(stringifyObj(userDataWithBonusPoints)));
    userDataWithConversion.units.find(u => u.type === 'OFFENSE' && u.level === 2).quantity -= 1;
    userDataWithConversion.units.find(u => u.type === 'OFFENSE' && u.level === 3).quantity += 1;

    const user5 = new UserModel(userDataWithConversion);
    const offense5 = user5.getArmyStat('OFFENSE');
    expect(offense5).toBe(Math.ceil(9666100)); // Updated offense calculation after conversion
  });

  it('should correctly calculate defense based on Revs Units - Test Defense', () => {
    userData.units = [
      {
        "type": "CITIZEN",
        "level": 1,
        "quantity": 0
      },
      {
        "type": "WORKER",
        "level": 1,
        "quantity": 27500
      },
      {
        "type": "OFFENSE",
        "level": 1,
        "quantity": 0
      },
      {
        "type": "DEFENSE",
        "level": 1,
        "quantity": 641 // 3 * 641 = 1923
      },
      {
        "type": "DEFENSE",
        "level": 2,
        "quantity": 12890 // 20 * 12890 = 257800
      },
      
    ];
    const userDataUnits = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userDataUnits.items = [];
    userDataUnits.fort_level = 1; // 5% bonus
    // user has a 5% bonus from their race/class
    userDataUnits.structure_upgrades = [
      { "type": "ARMORY", "level": 1 },
      { "type": "SPY", "level": 1 },
      { "type": "SENTRY", "level": 1 },
      { "type": "OFFENSE", "level": 1 }
    ];
    userDataUnits.battle_upgrades = [
      { "type": "DEFENSE", "level": 1, "quantity": 0 },
      { "type": "DEFENSE", "level": 2, "quantity": 0 }
    ];
    userDataUnits.bonus_points = [{ "type": "DEFENSE", "level": 0 }];
    const user = new UserModel(userDataUnits);
    const defense = user.getArmyStat('DEFENSE');
    
    expect(defense).toBe(Math.ceil(259723 * 1.1)); // 259753

    const userDataWithItems = JSON.parse(JSON.stringify(stringifyObj(userDataUnits)));
    userDataWithItems.items = [
      {
        "type": "WEAPON",
        "level": 2,
        "usage": "DEFENSE",
        "quantity": 20000 // 13531 * 50 = 676550
      },
      {
        "type": "HELM",
        "level": 2,
        "usage": "DEFENSE",
        "quantity": 20000 // 12 * 13531 = 162372
      },
      {
        "type": "BRACERS",
        "level": 2,
        "usage": "DEFENSE",
        "quantity": 20000 // 5 * 13531 = 67655
      },
      {
        "type": "SHIELD",
        "level": 2,
        "usage": "DEFENSE",
        "quantity": 20000 // 25 * 13531 = 338275
      },
      {
        "type": "BOOTS",
        "level": 2,
        "usage": "DEFENSE",
        "quantity": 20000 // 12 * 13531 = 162372
      },
      {
        "type": "ARMOR",
        "level": 2,
        "usage": "DEFENSE",
        "quantity": 20000 // 38 * 13531 = 514178
      },
    ];

    const user2 = new UserModel(userDataWithItems);
    const defense2 = user2.getArmyStat('DEFENSE');
    expect(defense2).toBe(Math.ceil(2181125 * 1.1));  // 259723 + 1921402 = 2181125

    const userDataWithBattleUpgrades = JSON.parse(JSON.stringify(stringifyObj(userDataWithItems)));
    userDataWithBattleUpgrades.battle_upgrades = [{
      "type": "DEFENSE", "level": 1, "quantity": 15539 // 200 * 12890 L2 Units = 2578000
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
    }];

    userDataWithBattleUpgrades.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];

    const user3 = new UserModel(userDataWithBattleUpgrades);
    const offense3 = user3.getArmyStat('DEFENSE');
    expect(offense3).toBe(Math.ceil(1.1 * (2181125 + 2578000)));  // 2181125 + 2578000 = 4759125

    const userDataWithBonusPoints = JSON.parse(JSON.stringify(stringifyObj(userDataWithBattleUpgrades)));
    userDataWithBonusPoints.bonus_points = [{ "type": "DEFENSE", "level": 24 }];
    userDataWithBonusPoints.battle_upgrades = [{
      "type": "DEFENSE", "level": 1, "quantity": 15539 //12890 units / 5 covered = 2578 < 15539 = 2578*5*200 = 2578000
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
    }];
    userDataWithBonusPoints.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];
    const user4 = new UserModel(userDataWithBonusPoints);
    const offense4 = user4.getArmyStat('DEFENSE');
    expect(offense4).toBe(Math.ceil((2578000 + 2181125) * 1.34));


    // Convert 1 Level 2 Offense unit to a Level 3 Offense unit
    userDataWithBonusPoints.bonus_points = [{ "type": "DEFENSE", "level": 24 }];
    userDataWithBonusPoints.battle_upgrades = [{
      "type": "DEFENSE", "level": 1, "quantity": 15539 // (12890 units / 5 covered)
    }];
    userDataWithBonusPoints.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];
    const userDataWithConversion = JSON.parse(JSON.stringify(stringifyObj(userDataWithBonusPoints)));
    userDataWithConversion.units.find(u => u.type === 'DEFENSE' && u.level === 1).quantity -= 1; // -3 Bonus
    userDataWithConversion.units.find(u => u.type === 'DEFENSE' && u.level === 2).quantity += 1; // +20 Bonus + 200 Bonus from Battle Upgrade

    const user5 = new UserModel(userDataWithConversion);
    const defense5 = user5.getArmyStat('DEFENSE');
    expect(defense5).toBe(Math.ceil(((2578000 + 2181125) + 217) * 1.34)); // Updated defense calculation after conversion

  });
});