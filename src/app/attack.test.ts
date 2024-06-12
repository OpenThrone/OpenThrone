import UserModel from "@/models/Users";
import { simulateBattle } from "./actions";

const defense = {
  "id": 84,
  "gold": "1713",
  "race": "UNDEAD",
  "class": "FIGHTER",
  "items": [
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
      "quantity": 13785
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
      "quantity": 1000
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
  "fortLevel": 3,
  "experience": 104151,
  "bonus_points": [
    {
      "type": "PRICES",
      "level": 5
    },
    {
      "type": "OFFENSE",
      "level": 5
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
  "fortHitpoints": 0,
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
      "quantity": 1
    }
  ],
  "structure_upgrades": [
    {
      "type": "OFFENSE",
      "level": 3
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
      "quantity": 20
    },
    {
      "type": "WORKER",
      "level": 1,
      "quantity": 13189
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
      "quantity": 1116
    }
  ],
  "fortLevel": 5,
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
      "quantity": 50
    },
    {
      "type": "DEFENSE",
      "level": 1,
      "quantity": 18
    },
    {
      "type": "SENTRY",
      "level": 1,
      "quantity": 0
    },
    {
      "type": "OFFENSE",
      "level": 2,
      "quantity": 8
    }
  ],
  "structure_upgrades": [
    {
      "type": "ARMORY",
      "level": 2
    },
    {
      "type": "SPY",
      "level": 2
    },
    {
      "type": "SENTRY",
      "level": 1
    },
    {
      "type": "OFFENSE",
      "level": 5
    }
  ]
}

describe('setup Attack test', () => {
  it('should simulate a battle between equal armies', async () => {
    const equalAttacker = new UserModel({
      ...attacker,
      fortHitpoints: 500,
      units: attacker.units.map(unit => ({ ...unit, quantity: 1000 }))
    });
    const equalDefender = new UserModel({
      ...defense,
      fortHitpoints: 500,
      units: defense.units.map(unit => ({ ...unit, quantity: 1000 }))
    });
    const battle = await simulateBattle(equalAttacker, equalDefender, 10);
    console.log('Equal Armies - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially more offense', async () => {
    const strongAttacker = new UserModel({
      ...attacker,
      units: attacker.units.map(unit => unit.type === 'OFFENSE' && unit.level === 2 ? { ...unit, quantity: unit.quantity + 10000 } : unit)
    });
    const weakDefender = new UserModel({
      ...defense
    });
    const battle = await simulateBattle(strongAttacker, weakDefender, 10);
    console.log('Strong Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });

  it('should simulate a battle where the attacker has substantially less offense', async () => {
    const weakAttacker = new UserModel({
      ...attacker,
      units: attacker.units.map(unit => unit.type === 'OFFENSE' && unit.level === 1 ? { ...unit, quantity: Math.max(0, unit.quantity - 10000) } : unit)
    });
    const strongDefender = new UserModel({
      ...defense,
      units: defense.units.map(unit => unit.type === 'DEFENSE' && unit.level === 2 ? { ...unit, quantity: unit.quantity + 10000 } : unit)
    });

    // Log the quantities for verification
    //console.log('Weak Attacker Units: ', weakAttacker.units.map(unit => ({ type: unit.type, quantity: unit.quantity, level: unit.level })));
    //console.log('Strong Defender Units: ', strongDefender.units.map(unit => ({ type: unit.type, quantity: unit.quantity, level: unit.level })));

    const battle = await simulateBattle(weakAttacker, strongDefender, 10);
    console.log('Weak Attacker - Attacker Losses: ', battle.Losses.Attacker.total, 'Defender Losses: ', battle.Losses.Defender.total);
  });
});
