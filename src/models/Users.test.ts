import { stringifyObj } from '@/utils/numberFormatting';
import UserModel from './Users';
import { EconomyUpgrades, Fortifications } from '@/constants';

describe('UserModel', () => {
  let userData: any = {
    id: 1,
    display_name: 'TestUser',
    email: 'test@example.com',
    password_hash: 'hash',
    race: 'ELF',
    class: 'ASSASSIN',
    experience: 100,
    gold: BigInt(1000),
    gold_in_bank: BigInt(5000),
    attack_turns: 10,
    last_active: new Date(),
    units: [],
    items: [],
    bio: 'A test user',
    colorScheme: 'dark',
    locale: 'en-US',
    economy_level: 1,
    fort_level: 1,
    fort_hitpoints: 100,
    house_level: 1,
    totalAttacks: 20,
    totalDefends: 15,
    won_attacks: 10,
    won_defends: 5,
    structure_upgrades: [{ "type": "ARMORY", "level": 0 }, { "type": "SPY", "level": 0 }, { "type": "SENTRY", "level": 0 }, { "type": "OFFENSE", "level": 0 }],
    battle_upgrades: []
  };

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
    console.log('offense5', offense5);
    expect(offense5).toBe(Math.ceil(9666100)); // Updated offense calculation after conversion
    
    console.log('difference in offense', offense5 - offense4);

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
    userDataUnits.structure_upgrades = [{ "type": "ARMORY", "level": 1 }, { "type": "SPY", "level": 1 }, { "type": "SENTRY", "level": 1 }, { "type": "OFFENSE", "level": 1 }];
    userDataUnits.battle_upgrades = [{ "type": "DEFENSE", "level": 1, "quantity": 0 }, { "type": "DEFENSE", "level": 2, "quantity": 0 }];
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
    console.log(userDataWithBattleUpgrades);
    userDataWithBattleUpgrades.battle_upgrades = [{
      "type": "DEFENSE", "level": 1, "quantity": 15539 // 200 * 13531 = 2706200
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
    }];

    userDataWithBattleUpgrades.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];

    const user3 = new UserModel(userDataWithBattleUpgrades);
    const offense3 = user3.getArmyStat('DEFENSE');
    expect(offense3).toBe(Math.ceil(2696725 * 1.1));  // 2181125 + 515600 = 2696725

    const userDataWithBonusPoints = JSON.parse(JSON.stringify(stringifyObj(userDataWithBattleUpgrades)));
    userDataWithBonusPoints.bonus_points = [{ "type": "DEFENSE", "level": 24 }];
    userDataWithBonusPoints.battle_upgrades = [{
      "type": "DEFENSE", "level": 1, "quantity": 15539 // 200 * 15539 = 3107800
    }, {
      "type": "OFFENSE", "level": 2, "quantity": 0
    }];
    userDataWithBonusPoints.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];

    const user4 = new UserModel(userDataWithBonusPoints);
    const offense4 = user4.getArmyStat('DEFENSE');
    expect(offense4).toBe(Math.ceil(2696725 * 1.34));


    // Convert 1 Level 2 Offense unit to a Level 3 Offense unit
    userDataWithBonusPoints.bonus_points = [{ "type": "DEFENSE", "level": 24 }];
    userDataWithBonusPoints.battle_upgrades = [{
      "type": "DEFENSE", "level": 1, "quantity": 15539 // (12890 units / 5 covered)
    }];
    userDataWithBonusPoints.structure_upgrades = [{ "type": 'OFFENSE', "level": 7 }];
    const userDataWithConversion = JSON.parse(JSON.stringify(stringifyObj(userDataWithBonusPoints)));
    userDataWithConversion.units.find(u => u.type === 'DEFENSE' && u.level === 1).quantity -= 1;
    userDataWithConversion.units.find(u => u.type === 'DEFENSE' && u.level === 2).quantity += 1;

    const user5 = new UserModel(userDataWithConversion);
    const offense5 = user5.getArmyStat('DEFENSE');
    expect(offense5).toBe(Math.ceil(3613688)); // Updated offense calculation after conversion

    console.log('difference in defense', offense5 - offense4);

  });
});