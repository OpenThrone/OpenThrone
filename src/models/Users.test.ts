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
    bonus_points: [{ level: 1 }, { level: 2 }],
    structure_upgrades: [{ "type": "ARMORY", "level": 0 }, { "type": "SPY", "level": 0 }, { "type": "SENTRY", "level": 0 }, { "type": "OFFENSE", "level": 0 }],
  };

  it('should correctly instantiate with default values when no userData is provided', () => {
    const user = new UserModel(null);
    expect(user.id).toBe(0);
    expect(user.displayName).toBe('');
    expect(user.race).toBe('ELF');
    expect(user.class).toBe('ASSASSIN');
  });

  it('should correctly instantiate with provided userData (no password shown)', () => {
    const user = new UserModel(userData, true);
    expect(user.id).toEqual(userData.id);
    expect(user.displayName).toEqual(userData.display_name);
    console.log(user.passwordHash)
    expect(user.passwordHash).toBe('');
  });

  //Test if Fortification is correct based on Fort Level
  it('should correctly calculate fortification based on fort level', () => {
    const user = new UserModel(userData);
    const fortification = Fortifications.find(f => f.level === user.fortLevel);

    expect(fortification.hitpoints).toBe(50);
    user.fortLevel = 5;
    expect(Fortifications.find(f => f.level === user.fortLevel).hitpoints).toBe(500);
  });

  //Test to make sure that Offense is correct based on Units
  it('should correctly calculate offense based on no units or items', () => {
    const user = new UserModel(userData);
    const offense = user.offense;
    expect(offense).toBe(0);
  });

  it('should correctly calculate offense based on units', () => {
    userData.units = [
      { level: 1, type: 'OFFENSE', quantity: 10 }, //3bonus * 10 = 30
      { level: 2, type: 'OFFENSE', quantity: 5 }, //20bonus * 5 = 100
    ];
    const user = new UserModel(userData);
    const offense = user.offense;
    expect(offense).toBe(130);
  });

  //Test to make sure that Offense is correct based on Items
  it('should correctly calculate offense based on items', () => {
    userData.items = [
      { level: 1, type: 'WEAPON', usage:"OFFENSE", quantity: 1 }, //25bonus * 1 = 25
      { level: 2, type: 'WEAPON', usage: "OFFENSE", quantity: 1 }, //50bonus * 1 = 50
    ];
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [];
    const user = new UserModel(userData2);
    const offense = user.offense;
    expect(offense).toBe(0);
    userData2.units = [
      { level: 1, type: 'OFFENSE', quantity: 1 }, //3bonus * 1 = 3
      { level: 2, type: 'OFFENSE', quantity: 1 }, //20bonus * 1 = 20
      { level: 1, type: 'DEFENSE', quantity: 1 }, //3bonus * 1 = 3 this should be ignored
    ];
    const user2 = new UserModel(userData2);
    const offense2 = user2.offense;
    expect(offense2).toBe(23 + 75);
  });

  //Test to make sure that Defense is correct based on Units and Fortification
  it('should correctly calculate defense based on units and fortification', () => {
    const user = new UserModel(userData);
    const defense = user.defense;
    expect(defense).toBe(0);
    const userData2 = JSON.parse(JSON.stringify(stringifyObj(userData)));
    userData2.units = [
      { level: 1, type: 'DEFENSE', quantity: 1 }, //3bonus * 1 = 3
      { level: 2, type: 'DEFENSE', quantity: 1 }, //20bonus * 1 = 20
    ];
    const user2 = new UserModel(userData2);
    const defense2 = user2.defense;
    expect(user2.fortLevel).toBe(1);
    expect(user.defenseBonus).toBe(10);
    expect(defense2).toBe(26);

    userData2.fort_level = 5; //'Outpost Level 2' - 25% defense bonus
    const user3 = new UserModel(userData2);
    expect(user3.fortLevel).toBe(5);
    expect(user3.defenseBonus).toBe(30); // 30%
    const defense3 = user3.defense;
    expect(defense3).toBe(30); // 30% of 23 = 7 (rounded) + 23 = 30
  });

  //Test to make sure that GoldPerWorker is correct based on Economy Level
  it('should correctly calculate gold per worker based on economy level', () => {
    const user = new UserModel(userData);
    expect(user.goldPerTurn).toBe(BigInt(1000));
    expect(EconomyUpgrades.find(x=>x.index === user.economyLevel).goldPerWorker).toBe(55);
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
    expect(user2.offense).toBe(108);
  });
});