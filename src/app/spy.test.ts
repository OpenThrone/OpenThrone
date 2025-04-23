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

describe('Spy Test', () => {
  it('should simulate a battle between equal armies', async () => {
    const attackPlayer = JSON.parse(JSON.stringify(stringifyObj(attacker)));
    const defensePlayer = JSON.parse(JSON.stringify(stringifyObj(defense)));
    const equalAttacker = new UserModel({
      ...attackPlayer,
      fortHitpoints: 500,
      units: attacker.units.filter(unit => (unit.type === 'SPY' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const equalDefender = new UserModel({
      ...defensePlayer,
      gold_in_bank: stringifyObj(BigInt(1000000)),
      fortHitpoints: 500,
      units: defense.units.filter(unit => (unit.type === 'DEFENSE' && unit.level === 1)).map(unit => ({ ...unit, quantity: 1000 }))
    });
    const battle = await simulateIntel(equalAttacker, equalDefender, 1);
    //logInfo(battle)
    //logInfo(battle.intelligenceGathered.units)
    //logInfo(battle.intelligenceGathered.items)
  });
});
