import UserModel from "@/models/Users";
import { simulateBattle } from "../utils/attackFunctions";
import mtRand from "@/utils/mtrand";
import { stringifyObj } from "@/utils/numberFormatting";
import MockUserGenerator from "@/utils/MockUserGenerator";

const defense = {
  "id": 84,
  "gold": "1713",
  "goldInBank": "1337",
  "race": "UNDEAD",
  "class": "FIGHTER",
  "items": [
    {
      "type": "WEAPON",
      "level": 1,
      "usage": "SENTRY",
      "quantity": 0
    },
    {
      "type": "WEAPON",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 2290
    },
    {
      "type": "HELM",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 2290
    },
    {
      "type": "BRACERS",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 2290
    },
    {
      "type": "SHIELD",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 2290
    },
    {
      "type": "BOOTS",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 2290
    },
    {
      "type": "ARMOR",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 2290
    },
    {
      "type": "WEAPON",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 3923
    },
    {
      "type": "HELM",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 3923
    },
    {
      "type": "BRACERS",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 3923
    },
    {
      "type": "SHIELD",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 3923
    },
    {
      "type": "BOOTS",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 3923
    },
    {
      "type": "ARMOR",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 3923
    },
    {
      "type": "WEAPON",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 46
    },
    {
      "type": "HELM",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 46
    },
    {
      "type": "BRACERS",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 46
    },
    {
      "type": "SHIELD",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 46
    },
    {
      "type": "BOOTS",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 46
    },
    {
      "type": "ARMOR",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 46
    },
    {
      "type": "WEAPON",
      "level": 3,
      "usage": "DEFENSE",
      "quantity": "7"
    },
    {
      "type": "HELM",
      "level": 3,
      "usage": "DEFENSE",
      "quantity": "7"
    },
    {
      "type": "BRACERS",
      "level": 3,
      "usage": "DEFENSE",
      "quantity": "7"
    },
    {
      "type": "SHIELD",
      "level": 3,
      "usage": "DEFENSE",
      "quantity": "7"
    },
    {
      "type": "BOOTS",
      "level": 3,
      "usage": "DEFENSE",
      "quantity": "7"
    },
    {
      "type": "ARMOR",
      "level": 3,
      "usage": "DEFENSE",
      "quantity": "7"
    },
    {
      "type": "WEAPON",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": 1
    }
  ],
  "units": [
    {
      "type": "CITIZEN",
      "level": 1,
      "quantity": 10
    },
    {
      "type": "WORKER",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "OFFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "DEFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "SPY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "SENTRY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "DEFENSE",
      "level": 2,
      "quantity": 0
    },
    {
      "type": "OFFENSE",
      "level": 2,
      "quantity": 0
    }
  ],
  "fort_level": 3,
  "experience": 104151,
  "bonus_points": [
    {
      "type": "PRICES",
      "level": 5
    },
    {
      "type": "OFFENSE",
      "level": 0
    },
    {
      "type": "DEFENSE",
      "level": 0
    },
    {
      "type": "INCOME",
      "level": 0
    },
    {
      "type": "INTEL",
      "level": 0
    }
  ],
  "fortHitpoints": 500,
  "battle_upgrades": [
    {
      "type": "OFFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "SPY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "SENTRY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "DEFENSE",
      "level": 1,
      "quantity": 0
    }
  ],
  "structure_upgrades": [
    {
      "type": "OFFENSE",
      "level": 1
    },
    {
      "type": "SPY",
      "level": 1
    },
    {
      "type": "SENTRY",
      "level": 1
    },
    {
      "type": "ARMORY",
      "level": 1
    }
  ]
};
const attacker = {
  "id": 1,
  "gold": "8760034",
  "race": "HUMAN",
  "class": "FIGHTER",
  "items": [
    {
      "type": "WEAPON",
      "level": 1,
      "usage": "SPY",
      "quantity": 0
    },
    {
      "type": "WEAPON",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": 1500
    },
    {
      "type": "WEAPON",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "HELM",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "BRACERS",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "SHIELD",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "BOOTS",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "ARMOR",
      "level": 2,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "WEAPON",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 3000
    },
    {
      "type": "HELM",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 3000
    },
    {
      "type": "BRACERS",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 3000
    },
    {
      "type": "SHIELD",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 3000
    },
    {
      "type": "BOOTS",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 3000
    },
    {
      "type": "ARMOR",
      "level": 2,
      "usage": "DEFENSE",
      "quantity": 3000
    },
    {
      "type": "ARMOR",
      "level": 1,
      "usage": "DEFENSE",
      "quantity": 0
    },
    {
      "type": "ARMOR",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": 1000
    },
    {
      "type": "HELM",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": "1000"
    },
    {
      "type": "BRACERS",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": "1000"
    },
    {
      "type": "SHIELD",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": "1000"
    },
    {
      "type": "BOOTS",
      "level": 1,
      "usage": "OFFENSE",
      "quantity": "1000"
    }
  ],
  "units": [
    {
      "type": "CITIZEN",
      "level": 1,
      "quantity": 10
    },
    {
      "type": "WORKER",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "OFFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "DEFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "SPY",
      "level": 1,
      "quantity": 10
    },
    {
      "type": "SENTRY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "DEFENSE",
      "level": 2,
      "quantity": 0
    },
    {
      "type": "OFFENSE",
      "level": 2,
      "quantity": 0
    }
  ],
  "fort_level": 5,
  "experience": 101954,
  "houseLevel": 1,
  "attackTurns": 7825,
  "displayName": "DasTacoMann",
  "bonus_points": [
    {
      "type": "OFFENSE",
      "level": 1
    },
    {
      "type": "DEFENSE",
      "level": 1
    },
    {
      "type": "INCOME",
      "level": 1
    },
    {
      "type": "INTEL",
      "level": 0
    },
    {
      "type": "PRICES",
      "level": 90
    }
  ],
  "economyLevel": 1,
  "fortHitpoints": 500,
  "battle_upgrades": [
    {
      "type": "OFFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "DEFENSE",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "SENTRY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "OFFENSE",
      "level": 2,
      "quantity": 0
    }
  ],
  "structure_upgrades": [
    {
      "type": "ARMORY",
      "level": 1
    },
    {
      "type": "SPY",
      "level": 1
    },
    {
      "type": "SENTRY",
      "level": 1
    },
    {
      "type": "OFFENSE",
      "level": 1
    }
  ]
}

describe('setup Attack test', () => {
  it('should simulate a battle between equal armies', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'OFFENSE' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      fortHitpoints: 500,
      units: defense.units.filter(unit=>(unit.type === 'DEFENSE' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const battle = await simulateBattle(equalAttacker, equalDefender, equalDefender.fortHitpoints, 1);
    console.log('Equal Armies - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially more offense', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const strongAttacker = new UserModel({
      ...attackPlayer,
      units: attacker.units.filter(unit => unit.type === 'OFFENSE' && unit.level === 1).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const weakDefender = new UserModel({
      ...defensePlayer,
      units: defense.units.filter(unit => unit.type === 'DEFENSE' && unit.level === 1).map(unit => ({ ...unit, quantity: 10 }))
    });
    const battle = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 10);
    console.log('Strong Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially less offense', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const weakAttacker = new UserModel({
      ...attackPlayer,
      units: attacker.units.filter(unit => unit.type === 'OFFENSE' && unit.level === 1).map(unit => ({ ...unit, quantity: mtRand(10, 100) }))
    });
    const strongDefender = new UserModel({
      ...defensePlayer,
      units: defense.units.filter(unit => unit.type === 'DEFENSE' && unit.level === 1).map(unit => ({ ...unit, quantity: mtRand(1000, 10000) }))
    });

    // Log the quantities for verification
    console.log(weakAttacker.unitTotals);
    console.log(strongDefender.unitTotals);
    const battle = await simulateBattle(weakAttacker, strongDefender, strongDefender.fortHitpoints, 10);
    console.log('Weak Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle with low fortHP (fort breached, extra casualties applied)', async () => {
    // Create a defender with low fortHP (e.g., 100 out of an initial 500)
    const lowFortDefender = new UserModel({
      ...JSON.parse(JSON.stringify(stringifyObj(defense))),
      fortHitpoints: 10,
      // Force a moderate number of defensive units to see casualty distribution
      units: defense.units.filter(unit => unit.type === 'DEFENSE' && unit.level === 1)
        .map(unit => ({ ...unit, quantity: 500 }))
    });

    // Attacker with a reasonable offensive force
    const attackerForLowFort = new UserModel({
      ...JSON.parse(JSON.stringify(stringifyObj(attacker))),
      units: attacker.units.filter(unit => unit.type === 'OFFENSE' && unit.level === 1)
        .map(unit => ({ ...unit, quantity: 1000 }))
    });

    const battle = await simulateBattle(attackerForLowFort, lowFortDefender, lowFortDefender.fortHitpoints, 10);
    console.log('Low FortHP Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total, 'Final FortHP:', battle.fortHitpoints);

    // Expect that the fort is severely damaged (or breached)
    expect(battle.fortHitpoints).toBeLessThan(100);
  });

  it('should simulate a battle with high fortHP (fort remains mostly intact)', async () => {
    // Create a defender with full fortHP (e.g., 500)
    const highFortDefender = new UserModel({
      ...JSON.parse(JSON.stringify(stringifyObj(defense))),
      fortHitpoints: 500,
      // Force a solid number of defensive units
      units: defense.units.filter(unit => unit.type === 'DEFENSE' && unit.level === 1)
        .map(unit => ({ ...unit, quantity: 1000 }))
    });

    // Attacker with a moderate offensive force
    const attackerForHighFort = new UserModel({
      ...JSON.parse(JSON.stringify(stringifyObj(attacker))),
      units: attacker.units.filter(unit => unit.type === 'OFFENSE' && unit.level === 1)
        .map(unit => ({ ...unit, quantity: 1000 }))
    });

    const battle = await simulateBattle(attackerForHighFort, highFortDefender, highFortDefender.fortHitpoints, 10);
    console.log('High FortHP Battle - Attacker Losses:', battle.Losses.Attacker.total,
      'Defender Losses:', battle.Losses.Defender.total, 'Final FortHP:', battle.fortHitpoints);

    // Expect that the fort remains largely intact (e.g., >300 HP)
    expect(battle.fortHitpoints).toBeGreaterThan(300);
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
    const attackerGenerator = new MockUserGenerator();
    attackerGenerator.setBasicInfo({
      email: 'testAttacker@test.com',
      display_name: 'TestAttacker',
      race: 'ELF',
      class: 'ASSASSIN'
    });
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
      { type: 'CITIZEN', level: 1, quantity: 10330 },
      { type: 'WORKER', level: 1, quantity: 20002 },
      { type: 'OFFENSE', level: 1, quantity: 10000 },
      { type: 'DEFENSE', level: 1, quantity: 20 },
      { type: 'SENTRY', level: 3, quantity: 1000 },
      { type: 'SENTRY', level: 2, quantity: 7200 },
    ]);
    userGenerator2.addExperience(10000);
    userGenerator2.setFortLevel(15);
    userGenerator2.setFortHitpoints(50);
    userGenerator2.setSentryUpgrade(5);
    const defenseMock = userGenerator2.getUser();
   const weakDefender = new UserModel(defenseMock);
    const strongAttacker = new UserModel(attackerGenerator.getUser());
    
    console.log('Strong Attacker - Units: ', strongAttacker.unitTotals);
    console.log('Weak Defender - Units: ', weakDefender.unitTotals);
    // Log the quantities for verification
    const battle = await simulateBattle(strongAttacker, weakDefender, weakDefender.fortHitpoints, 10, true);
    console.log('Weak Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
   
  });

});