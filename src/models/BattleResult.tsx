import type { BattleUnits, PlayerUnit } from '@/types/typings';

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
      units: BattleUnits[]
    };
    Defender: {
      total: number;
      units: BattleUnits[]
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

  distributeCasualties(units: BattleUnits[], casualties: number): BattleUnits[] {
    let distributedCasualties = 0;
    const killedUnits: BattleUnits[] = [];

    for (const unit of units) {
      const unitCasualties = Math.min(unit.quantity, casualties - distributedCasualties);
      distributedCasualties += unitCasualties;
      unit.quantity -= unitCasualties;

      if (unitCasualties > 0) {
        killedUnits.push({
          level: unit.level,
          type: unit.type,
          quantity: unitCasualties,
        });
      }

      if (distributedCasualties >= casualties) {
        break;
      }
    }

    return killedUnits;
  }

}

export default BattleResult;
