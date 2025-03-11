import UserModel from "@/models/Users";
import { simulateBattle } from "../utils/attackFunctions";
import mtRand from "@/utils/mtrand";
import { stringifyObj } from "@/utils/numberFormatting";
import MockUserGenerator from "@/utils/MockUserGenerator";

const defenderGenerator = new MockUserGenerator();
defenderGenerator.setBasicInfo({
  email: 'testDefender@test.com',
  display_name: 'TestDefender',
  race: 'HUMAN',
  class: 'FIGHTER'
});
const attackerGenerator = new MockUserGenerator();
attackerGenerator.setBasicInfo({
  email: 'testAttacker@test.com',
  display_name: 'TestAttacker',
  race: 'HUMAN',
  class: 'FIGHTER'
});

describe('setup Attack test', () => {
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
    console.log('Equal Armies - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially more offense', async () => {
   
    const strongAttacker = new UserModel(attackerGenerator.getUser());
    const weakDefender = new UserModel(defenderGenerator.getUser());
    const battle = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 10);
    console.log('Strong Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially less offense', async () => {

    const weakAttacker = new UserModel(attackerGenerator.getUser());
    const strongDefender = new UserModel(defenderGenerator.getUser());

    // Log the quantities for verification
    console.log(weakAttacker.unitTotals);
    console.log(strongDefender.unitTotals);
    const battle = await simulateBattle(weakAttacker, strongDefender, strongDefender.fortHitpoints, 10);
    console.log('Weak Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle with low fortHP (fort breached, extra casualties applied)', async () => {
    // Create a defender with low fortHP (e.g., 100 out of an initial 500)
    const lowFortDefender = new UserModel(defenderGenerator.getUser());

    // Attacker with a reasonable offensive force
    const attackerForLowFort = new UserModel(attackerGenerator.getUser());

    const battle = await simulateBattle(attackerForLowFort, lowFortDefender, lowFortDefender.fortHitpoints, 10);
    console.log('Low FortHP Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total, 'Final FortHP:', battle.fortHitpoints);

    // Expect that the fort is severely damaged (or breached)
    expect(battle.fortHitpoints).toBeLessThan(100);
  });

  it('should simulate a battle with high fortHP (fort remains mostly intact)', async () => {
    // Create a defender with full fortHP (e.g., 500)
    const highFortDefender = new UserModel(defenderGenerator.getUser());

    // Attacker with a moderate offensive force
    const attackerForHighFort = new UserModel(attackerGenerator.getUser());

    const battle = await simulateBattle(attackerForHighFort, highFortDefender, highFortDefender.fortHitpoints, 10);
    console.log('High FortHP Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total, 'Final FortHP:', battle.fortHitpoints);

    // Expect that the fort remains largely intact (e.g., >300 HP)
    console.log(battle)
    expect(battle.finalFortHP).toBeGreaterThan(300);
    // Expect casualty distribution to be lower (defender retains most defensive units)
    expect(battle.Losses.Defender.total).toBeLessThan(1000);
  });

  // simulate a battle with 400 Offense level 1 and 2 units against 20 Defense units level 1 and 5000 citizens. 
  // There should also be 120 Offense level 1 units in the Defenders army
  // The fortHP is 10% of the fort, let's set it to fort level 6 (outpost level 3).
  // We should see a lot of casualties on the defender side, specifically against the Defense Units and Citizens
  // The Offense shouldn't expect much loss in the first few turns
  // but a more fair fight will take place in the later turns
  it('should simulate a battle with 400 Offense level 1 and 2 units against 20 Defense units level 1 and 5000 citizens', async () => {
    
    attackerGenerator.addUnits([
      { type: 'OFFENSE', level: 1, quantity: 15000 },
      { type: 'OFFENSE', level: 2, quantity: 2000 },
    ]);

    attackerGenerator.addExperience(10000);
    attackerGenerator.setFortLevel(6);
    attackerGenerator.setFortHitpoints(50);

    const userGenerator2 = new MockUserGenerator();
    userGenerator2.setBasicInfo({
      email: 'testDefender@test.com',
      display_name: 'TestDefender',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
    userGenerator2.addUnits([
      { type: 'CITIZEN', level: 1, quantity: 5000 },
      { type: 'WORKER', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 1, quantity: 10000 },
      { type: 'DEFENSE', level: 2, quantity: 2500 },
      { type: 'SENTRY', level: 3, quantity: 1000 },
      { type: 'SENTRY', level: 2, quantity: 7200 },
    ]);
    userGenerator2.addBattleUpgrades([
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 10 },
      { type: 'SENTRY', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 2, quantity: 0 }
    ])
    userGenerator2.addExperience(10000);
    userGenerator2.setFortLevel(15);
    userGenerator2.setFortHitpoints(80);
    userGenerator2.setSentryUpgrade(5);
    const defenseMock = userGenerator2.getUser();
   const weakDefender = new UserModel(defenseMock);
    const strongAttacker = new UserModel(attackerGenerator.getUser());
    
    console.log('Strong Attacker - Units: ', strongAttacker.unitTotals);
    console.log('Weak Defender - Units: ', weakDefender.unitTotals);
    console.log('Weak Defender - FortHP: ', weakDefender.fortHitpoints);
    // Log the quantities for verification
    const battle1 = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 5, false);
    
    console.log('Weak Defender - After battle 1 - FortHP: ', weakDefender.fortHitpoints);
    weakDefender.fortHitpoints -= weakDefender.fortHitpoints - battle1.finalFortHP;
    const battle2 = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 2, false);
    console.log('Weak Defender - After battle 2 - FortHP: ', weakDefender.fortHitpoints);
    weakDefender.fortHitpoints -= weakDefender.fortHitpoints - battle2.finalFortHP;

    const battle3 = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 4, false);
    console.log('Weak Defender - After battle 3 - FortHP: ', weakDefender.fortHitpoints);
    weakDefender.fortHitpoints -= weakDefender.fortHitpoints - battle3.finalFortHP;

    const battle4 = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 1, false);
    console.log('Weak Defender - After battle 4 - FortHP: ', weakDefender.fortHitpoints);
    weakDefender.fortHitpoints -= weakDefender.fortHitpoints - battle4.finalFortHP;

    const battle5 = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 10, false);
    console.log('Weak Defender - After battle 5 - FortHP: ', weakDefender.fortHitpoints);
    weakDefender.fortHitpoints -= weakDefender.fortHitpoints - battle5.finalFortHP;

    console.log('Strong Attacker - Attacker Losses: ', battle1.Losses.Attacker.total, 'Defender Losses: ', battle1.Losses.Defender.total);
    console.log('Strong Attacker - Attacker Losses: ', battle2.Losses.Attacker.total, 'Defender Losses: ', battle2.Losses.Defender.total);
    console.log('Strong Attacker - Attacker Losses: ', battle3.Losses.Attacker.total, 'Defender Losses: ', battle3.Losses.Defender.total);
    console.log('Strong Attacker - Attacker Losses: ', battle4.Losses.Attacker.total, 'Defender Losses: ', battle4.Losses.Defender.total);
    console.log('Strong Attacker - Attacker Losses: ', battle5.Losses.Attacker.total, 'Defender Losses: ', battle5.Losses.Defender.total);

    expect(battle1.Losses.Attacker.total).toBeLessThan(battle1.Losses.Defender.total);
    expect(battle2.Losses.Attacker.total).toBeLessThan(battle2.Losses.Defender.total);
    expect(battle3.Losses.Attacker.total).toBeLessThan(battle3.Losses.Defender.total);
    expect(battle4.Losses.Attacker.total).toBeLessThan(battle4.Losses.Defender.total);
    expect(battle5.Losses.Attacker.total).toBeLessThan(battle5.Losses.Defender.total);
    
  });

});