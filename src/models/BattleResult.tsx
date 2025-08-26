import type { BattleUnits, PlayerUnit } from '@/types/typings';

import BattleSimulationResult from './BattleSimulationResult';
import type UserModel from './Users';
import { stringifyObj } from '@/utils/numberFormatting';
import mtRand from '@/utils/mtrand';

class BattleResult {
  attacker: UserModel;

  defender: UserModel;

  fortHitpoints: number;

  turnsTaken: number;

  experienceResult: BattleSimulationResult;

  pillagedGold: number | BigInt | undefined;

  experienceGained: { attacker: number; defender: number };

  finalFortHP: number;

  fortDamaged: boolean;

  strength: BattleUnits[];

  result: 'WIN' | 'LOSS' | 'UNDECIDED';

  casualtySummary: {
    attacker: Array<{
      type: string;
      level: number;
      quantity: number;
      description: string;
    }>;
    defender: Array<{
      type: string;
      level: number;
      quantity: number;
      description: string;
    }>;
    attackerTotal: number;
    defenderTotal: number;
    fortDamage: number;
  };

  Losses: {
    Attacker: {
      total: number;
      units: BattleUnits[]
    };
    Defender: {
      total: number;
      units: BattleUnits[]
    };

    
  };

  constructor(attacker: UserModel, defender: UserModel) {
    this.attacker = JSON.parse(JSON.stringify(stringifyObj(attacker))); // deep copy but we don't need email, passwordHash, goldInBank, bio, colorScheme
    this.defender = JSON.parse(JSON.stringify(stringifyObj(defender))); // deep copy but same as above
    this.fortHitpoints = 0;
    this.turnsTaken = 0;
    this.experienceResult = new BattleSimulationResult();
    this.pillagedGold = 0;
    this.experienceGained = { attacker: 0, defender: 0 };
    this.finalFortHP = 0;
    this.fortDamaged = false;
    this.strength = [];
    this.result = 'UNDECIDED';
    this.Losses = {
      Attacker: {
        total: 0,
        units: [],
      },
      Defender: {
        total: 0,
        units: [],
      },
    };
  }

  calculateResult(attacker: UserModel, defender: UserModel): 'WIN' | 'LOSS' | 'UNDECIDED' {
    //TODO: need to really flesh this out
    if (attacker.offense > defender.defense) {
      // Attacker Wins
      return 'WIN';
    } else {
      // Defender Wins
      return 'LOSS';
    }
  }

  /* Removed unused distributeCasualties method – logic handled in attackFunctions.ts */

}

export default BattleResult;
