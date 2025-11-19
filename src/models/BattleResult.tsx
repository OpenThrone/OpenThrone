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

  pillagedGold: bigint;

  experienceGained: { attacker: number; defender: number };

  finalFortHP: number;

  fortDamaged: boolean;

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
    this.pillagedGold = BigInt(0);
    this.experienceGained = { attacker: 0, defender: 0 };
    this.finalFortHP = 0;
    this.fortDamaged = false;
    this.result = 'UNDECIDED'; // Default value, will be set by calculateAndApplyExperience
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

}

export default BattleResult;
