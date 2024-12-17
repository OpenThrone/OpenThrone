import UserModel from "@/models/Users";
import { simulateBattle } from "../utils/attackFunctions";
import { simulateAssassination, simulateInfiltration, simulateIntel } from "../utils/spyFunctions";
import mtRand from "@/utils/mtrand";
import { stringifyObj } from "@/utils/numberFormatting";

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

describe('Infiltration Test', () => {
  it('should simulate an infiltration against a substantially weaker opponent. ', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      goldInBank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'DEFENSE' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const battle = await simulateInfiltration(equalAttacker, equalDefender, 3 );
    //console.log('battle: ', battle)
    console.log('Sies sent: ', battle.spiesSent);
    console.log(`We ${(battle.success ? 'won so noone dies, but we do damage to thier fort' : 'lost, so we lose all spies')}`);
    console.log('Spy Off: ', battle.attacker.spy, "Spy Def: ", battle.defender.sentry, "FortHP: ", battle.defender.fortHitpoints)
    console.log('Fort DMG:', battle.fortDmg)
    expect(equalDefender.fortHitpoints).toBe(battle.defender.fortHitpoints);
    expect(defensePlayer.fortHitpoints - battle.fortDmg).toBe(battle.defender.fortHitpoints);
    console.log('Starting Fort HP:', defensePlayer.fortHitpoints, "Ending Fort HP:", battle.defender.fortHitpoints)
    console.log('battle ended');
  })

  it('should simulate an infiltration against a substantially stronger opponent. ', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const attackPlayerCopy = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayerCopy = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      goldInBank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'SENTRY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 10000 }))
    });
    const battle = await simulateInfiltration(equalAttacker, equalDefender, 3);
    //console.log('battle: ', battle)
    console.log('Sies sent: ', battle.spiesSent);
    console.log(`We ${(battle.success ? 'won so noone dies, but we do damage to thier fort' : 'lost, so we lose all spies')}`);
    if (!battle.sucess) console.log(`Spies lost: ${battle.spiesLost}`);
    console.log('Spy Off: ', battle.attacker.spy, "Spy Def: ", battle.defender.sentry, "FortHP: ", battle.defender.fortHitpoints)
    console.log('Fort DMG:', battle.fortDmg)
    console.log('Starting Units:', attackPlayer.units, "Ending Units:", battle.attacker.units)
    expect(equalAttacker.units).toBe(battle.attacker.units);
    expect(equalDefender.fortHitpoints).toBe(battle.defender.fortHitpoints);
    expect(defensePlayer.fortHitpoints - battle.fortDmg).toBe(battle.defender.fortHitpoints);
    console.log('Starting Fort HP:', defensePlayer.fortHitpoints, "Ending Fort HP:", battle.defender.fortHitpoints)
    console.log('battle ended');
  })
  it('should simulate an infiltration against a equal opponent. ', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      goldInBank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'SENTRY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const battle = await simulateInfiltration(equalAttacker, equalDefender, 3);
    //console.log('battle: ', battle)
    if (!battle.sucesss) console.log(`Spies lost: ${battle.spiesLost}`);
    expect(equalDefender.fortHitpoints).toBe(battle.defender.fortHitpoints);
    expect(defensePlayer.fortHitpoints - battle.fortDmg).toBe(battle.defender.fortHitpoints);
  })

  
 /* it('should simulate an intelligence mission against a equal opponent. ', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 })),
      items: attacker.items.filter(item => item.type === 'WEAPON' && item.level === 1 && item.usage === 'SPY').map(item => {
        return { ...item, quantity: 1000 }
      })
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      goldInBank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'SENTRY' && unit.level === 1) || (unit.type === 'WORKER')).map(unit => ({ ...unit, quantity: 10 }))
    });
    const battle = await simulateIntel(equalAttacker, equalDefender, 3);
    expect(battle.success === true).toBe(true);
  })*/

  /*it('should simulate an assassination to kill workers. ', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 })),
      items: attacker.items.filter(item => item.type === 'WEAPON' && item.level === 1 && item.usage === 'SPY').map(item => {
        return { ...item, quantity: 1000 }
      })
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      goldInBank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'SENTRY' && unit.level === 1) || (unit.type === 'WORKER')).map(unit => ({ ...unit, quantity: 10 }))
    });

    console.log(equalDefender.unitTotals.citizens + equalDefender.unitTotals.workers)
    const battle = await simulateAssassination(equalAttacker, equalDefender, 3, 'CITIZEN/WORKERS');
    
    expect(battle.success === true).toBe(true);
    console.log(equalDefender.unitTotals.citizens + equalDefender.unitTotals.workers)
    //console.log('battle: ', battle)
    //if (!battle.sucesss) console.log(`Spies lost: ${battle.spiesLost}`);
    //expect(equalDefender.fortHitpoints).toBe(battle.defender.fortHitpoints);
    //expect(defensePlayer.fortHitpoints - battle.fortDmg).toBe(battle.defender.fortHitpoints);
  })*/
  
  it('it should simulate failing every mission, losing units along the way', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY')).map(unit => ({ ...unit, quantity: 1000 })),
      items: attacker.items.filter(item => item.type === 'WEAPON' && item.level === 1 && item.usage === 'SPY').map(item => {
        return { ...item, quantity: 1000 }
      })
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      goldInBank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'SENTRY' && unit.level === 1) || (unit.type === 'WORKER')).map(unit => ({ ...unit, quantity: 1000000 })),
      items: attacker.items.filter(item => item.type === 'WEAPON' && item.level === 1 && item.usage === 'SENTRY').map(item => {
        return { ...item, quantity: 1000000 }
      })
    });
    console.log(equalAttacker.units.filter(unit => unit.type === 'SPY').map(unit => unit.quantity))
    const intelMission = await simulateIntel(equalAttacker, equalDefender, 10);
    expect(intelMission.success === false).toBe(true);
    expect(intelMission.spiesLost === intelMission.spiesSent).toBe(true);

    console.log(equalAttacker.units.filter(unit => unit.type === 'SPY').map(unit => unit.quantity))
    
    const infiltrationMission = await simulateInfiltration(equalAttacker, equalDefender, 5);
  
    expect(infiltrationMission.success === false).toBe(true);
    expect(infiltrationMission.spiesLost).toBeGreaterThanOrEqual(infiltrationMission.spiesSent - 1); // Almost all spies should be lost.

    console.log(equalAttacker.units.filter(unit => unit.type === 'SPY').map(unit => unit.quantity))
    const assassinationMission = await simulateAssassination(equalAttacker, equalDefender, 1, 'CITIZEN/WORKERS');
    expect(assassinationMission.success === false).toBe(true);
    expect(infiltrationMission.spiesLost).toBeGreaterThanOrEqual(infiltrationMission.spiesSent - 1); // Almost all spies should be lost.

    console.log(equalAttacker.units.filter(unit => unit.type === 'SPY').map(unit => unit.quantity))
  })

})