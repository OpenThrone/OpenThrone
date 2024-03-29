import type { PlayerUnit } from '@/types/typings';

import BattleSimulationResult from './BattleSimulationResult';
import type UserModel from './Users';
import { stringifyObj } from '@/utils/numberFormatting';

class BattleResult {
  attacker: UserModel;

  defender: UserModel;

  fortHitpoints: number;

  turnsTaken: number;

  experienceResult: BattleSimulationResult;

  Losses: {
    Attacker: {
      total: number;
      units: PlayerUnit[]
    };
    Defender: {
      total: number;
      units: PlayerUnit[]
    };
  };

  constructor(attacker: UserModel, defender: UserModel) {
    this.attacker = JSON.parse(JSON.stringify(stringifyObj(attacker))); // deep copy
    this.defender = JSON.parse(JSON.stringify(stringifyObj(defender))); // deep copy
    this.fortHitpoints = 0;
    this.turnsTaken = 0;
    this.experienceResult = new BattleSimulationResult();
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
