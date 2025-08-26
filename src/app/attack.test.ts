import UserModel from "@/models/Users";
import { simulateBattle, newComputeCasualties } from "@/utils/attackFunctions";
import mtRand from "@/utils/mtrand";
import { stringifyObj } from "@/utils/numberFormatting";
import MockUserGenerator from "@/utils/MockUserGenerator";
import { logInfo } from "@/utils/logger";

describe('setup Attack test', () => {

  let attackerGenerator: MockUserGenerator;
  let defenderGenerator: MockUserGenerator;
  beforeEach(() => {
    defenderGenerator = new MockUserGenerator();
    defenderGenerator.setBasicInfo({
      email: 'testDefender@test.com',
      display_name: 'TestDefender',
      race: 'HUMAN',
      class: 'FIGHTER'
    });
    attackerGenerator = new MockUserGenerator();
    attackerGenerator.setBasicInfo({
      email: 'testAttacker@test.com',
      display_name: 'TestAttacker',
      race: 'HUMAN',
      class: 'FIGHTER'
    });
  });

  it('should simulate a battle between equal armies', async () => {
    attackerGenerator.addUnits([
      { type: 'OFFENSE', level: 1, quantity: 1000 },
    ]);

    attackerGenerator.addExperience(10000);

    defenderGenerator.addUnits([
      { type: 'DEFENSE', level: 1, quantity: 1000 },
    ]);

    defenderGenerator.addExperience(10000);
    defenderGenerator.setFortHitpoints(500);

    const equalAttacker = new UserModel(attackerGenerator.getUser());
    const equalDefender = new UserModel(defenderGenerator.getUser());
    const battle = await simulateBattle(equalAttacker, equalDefender, equalDefender.fortHitpoints, 1);
    logInfo('Equal Armies - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
    expect(battle.Losses.Attacker.total).toBeGreaterThan(0);
    expect(battle.Losses.Defender.total).toBeGreaterThan(0);
    
  });

  it('should simulate a battle where the attacker has substantially more offense', async () => {
    attackerGenerator.addUnits([
      { type: 'OFFENSE', level: 1, quantity: 2000 },
    ]);
    attackerGenerator.addExperience(10000);
    defenderGenerator.addUnits([
      { type: 'DEFENSE', level: 1, quantity: 100 },
    ]);
    defenderGenerator.addExperience(10000);
    const strongAttacker = new UserModel(attackerGenerator.getUser());
    const weakDefender = new UserModel(defenderGenerator.getUser());
    const battle = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 10);
    logInfo('Strong Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially less offense', async () => {

    attackerGenerator.addUnits([
      { type: 'OFFENSE', level: 1, quantity: 100 },
    ]);
    attackerGenerator.addExperience(10000);
    defenderGenerator.addUnits([
      { type: 'DEFENSE', level: 1, quantity: 2000 },
    ]);
    const weakAttacker = new UserModel(attackerGenerator.getUser());
    const strongDefender = new UserModel(defenderGenerator.getUser());

    // Log the quantities for verification
    logInfo(weakAttacker.unitTotals);
    logInfo(strongDefender.unitTotals);
    const battle = await simulateBattle(weakAttacker, strongDefender, strongDefender.fortHitpoints, 10);
    expect(battle.Losses.Attacker.total).toBeGreaterThan(0);
    expect(battle.Losses.Defender.total).toBeGreaterThanOrEqual(0);
    expect(battle.Losses.Attacker.total).toBeGreaterThan(battle.Losses.Defender.total);
  });

  it('should simulate a battle with low fortHP (fort breached, extra casualties applied)', async () => {
    // Create a defender with low fortHP (e.g., 100 out of an initial 500)
    const lowFortDefender = new UserModel(defenderGenerator.getUser());

    // Attacker with a reasonable offensive force
    const attackerForLowFort = new UserModel(attackerGenerator.getUser());

    const battle = await simulateBattle(attackerForLowFort, lowFortDefender, lowFortDefender.fortHitpoints, 10);
    logInfo('Low FortHP Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total, 'Final FortHP:', battle.fortHitpoints);

    // Expect that the fort is severely damaged (or breached)
    expect(battle.fortHitpoints).toBeLessThan(100);
  });

  it('should simulate a battle with high fortHP (fort remains mostly intact)', async () => {
    // Create a defender with full fortHP (e.g., 500)
    defenderGenerator.setFortHitpoints(500);
    const highFortDefender = new UserModel(defenderGenerator.getUser());

    // Attacker with a moderate offensive force
    const attackerForHighFort = new UserModel(attackerGenerator.getUser());

    const battle = await simulateBattle(attackerForHighFort, highFortDefender, highFortDefender.fortHitpoints, 10);
    logInfo('High FortHP Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total, 'Final FortHP:', battle.fortHitpoints);

    // Expect that the fort remains largely intact (e.g., >300 HP)
    logInfo(battle)
    expect(battle.finalFortHP).toBeGreaterThan(300);
    // Expect casualty distribution to be lower (defender retains most defensive units)
    expect(battle.Losses.Defender.total).toBeLessThan(1000);
    it('should apply new casualty formula correctly for balanced fight', () => {
      const result = newComputeCasualties(1000, 1000, 10000, 10000, 1000, 1.0, 1000, false, false);
      expect(result.attackerCasualties).toBeGreaterThanOrEqual(25);
      expect(result.attackerCasualties).toBeLessThanOrEqual(300);
      expect(result.defenderCasualties).toBeGreaterThanOrEqual(25);
      expect(result.defenderCasualties).toBeLessThanOrEqual(500);
    });
  
    it('should apply new casualty formula correctly for overwhelming attacker', () => {
      const result = newComputeCasualties(5000, 500, 20000, 20000, 1000, 10.0, 0, true, false);
      expect(result.defenderCasualties).toBeGreaterThan(500);
      expect(result.attackerCasualties).toBeLessThanOrEqual(600);
    });
  
    it('should wipe out small side in extreme mismatch', () => {
      const result = newComputeCasualties(100, 5000, 100, 10000, 1000, 0.01, 1000, false, false);
      expect(result.attackerCasualties).toBe(100);
      expect(result.defenderCasualties).toBeLessThan(1000);
    });
  
    it('should add collateral casualties after fort destroyed', () => {
      const fortified = newComputeCasualties(2000, 2000, 15000, 15000, 2000, 1.0, 2000, true, false);
      const breached = newComputeCasualties(2000, 2000, 15000, 15000, 2000, 1.0, 0, true, false);
      expect(breached.defenderCasualties).toBeGreaterThanOrEqual(fortified.defenderCasualties);
    });
  });

  it('should simulate a battle with 400 Offense level 1 and 2 units against 20 Defense units level 1 and 5000 citizens', async () => {

    attackerGenerator.addUnits([
      { type: 'OFFENSE', level: 1, quantity: 200 },
      { type: 'OFFENSE', level: 2, quantity: 200 },
    ]);

    attackerGenerator.addExperience(10000);
    attackerGenerator.setFortLevel(6);
    attackerGenerator.setFortHitpoints(50);

    const defenseGenerator = new MockUserGenerator();
    defenseGenerator.setBasicInfo({
      email: 'testDefender@test.com',
      display_name: 'TestDefender',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    defenseGenerator.addUnits([
      { type: 'CITIZEN', level: 1, quantity: 5000 },
      { type: 'WORKER', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 20 },
    ]);
    defenseGenerator.addBattleUpgrades([
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
      { type: 'SENTRY', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 2, quantity: 0 }
    ])
    defenseGenerator.addExperience(10000);
    defenseGenerator.setFortLevel(15);
    defenseGenerator.setFortHitpoints(80);
    defenseGenerator.setSentryUpgrade(5);
    const defenseMock = defenseGenerator.getUser();
    const weakDefender = new UserModel(defenseMock);
    const strongAttacker = new UserModel(attackerGenerator.getUser());

    logInfo('Strong Attacker - Units: ', strongAttacker.unitTotals);
    logInfo('Weak Defender - Units: ', weakDefender.unitTotals);
    logInfo('Weak Defender - FortHP: ', weakDefender.fortHitpoints);
    // Log the quantities for verification
    const battle1 = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 10, false);

    logInfo('Weak Defender - After battle 1 - FortHP: ', weakDefender.fortHitpoints);
    logInfo('Strong Attacker - Attacker Losses: ', battle1.Losses.Attacker.total, 'Defender Losses: ', battle1.Losses.Defender.total);
    // With Defense Round + Collateral Round, trained defenders should die off quickly and citizens should take meaningful casualties
    expect(battle1.Losses.Defender.total).toBeGreaterThan(battle1.Losses.Attacker.total);
    expect(battle1.Losses.Defender.units.find(u => u.type === 'DEFENSE')?.quantity || 0).toBeGreaterThan(0);
    expect(battle1.Losses.Defender.units.find(u => u.type === 'CITIZEN')?.quantity || 0).toBeGreaterThan(10);
    expect(battle1.Losses.Attacker.total).toBeLessThan(20);

    logInfo('Defender Losses Breakdown:', battle1.Losses.Defender);
  });

  it('should simulate a battle with a "Meat Shield" scenario', async () => {
    const attacker = new MockUserGenerator();
    attacker.setBasicInfo({
      email: 'meatshield_attacker@test.com',
      display_name: 'MeatShieldAttacker',
      race: 'HUMAN',
      class: 'FIGHTER'
    });
    attacker.addUnits([
      { type: 'OFFENSE', level: 2, quantity: 500 },
    ]);
    attacker.addExperience(20000);

    const defender = new MockUserGenerator();
    defender.setBasicInfo({
      email: 'meatshield_defender@test.com',
      display_name: 'MeatShieldDefender',
      race: 'HUMAN',
      class: 'FIGHTER'
    });
    defender.addUnits([
      { type: 'DEFENSE', level: 1, quantity: 100 },
      { type: 'CITIZEN', level: 1, quantity: 1000 },
    ]);
    defender.addExperience(10000);
    defender.setFortHitpoints(500);

    const attackerModel = new UserModel(attacker.getUser());
    const defenderModel = new UserModel(defender.getUser());

    const battle = await simulateBattle(attackerModel, defenderModel, defenderModel.fortHitpoints, 10);

    logInfo('Meat Shield Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total);

    const defenderLosses = battle.Losses.Defender.units.reduce((acc, unit) => {
      acc[unit.type] = (acc[unit.type] || 0) + unit.quantity;
      return acc;
    }, {});

    logInfo('Defender Losses Breakdown:', defenderLosses);

    // Expect that citizens took the majority of the losses
    expect(defenderLosses['CITIZEN']).toBeGreaterThan(defenderLosses['DEFENSE']);
    // Expect that the attacker's losses are relatively low
    expect(battle.Losses.Attacker.total).toBeLessThan(defenderLosses['CITIZEN'] + defenderLosses['DEFENSE']);
  });
});