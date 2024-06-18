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

  pillagedGold: number | BigInt | undefined;

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
    this.pillagedGold = 0;
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

    // Calculate the max number of citizens and workers that can be at risk
    const totalCitizens = units.filter(unit => unit.type === 'CITIZEN').reduce((sum, unit) => sum + unit.quantity, 0);
    const totalWorkers = units.filter(unit => unit.type === 'WORKER').reduce((sum, unit) => sum + unit.quantity, 0);
    const maxRiskCitizens = Math.floor(totalCitizens * 0.25);
    const maxRiskWorkers = Math.floor(totalWorkers * 0.25);

    for (const unit of units) {
      let unitCasualties = 0;

      if (unit.type === 'CITIZEN' || unit.type === 'WORKER') {
        const maxRiskUnits = unit.type === 'CITIZEN' ? maxRiskCitizens : maxRiskWorkers;
        const riskUnits = Math.min(unit.quantity, maxRiskUnits);
        unitCasualties = Math.min(riskUnits, casualties - distributedCasualties);
      } else {
        unitCasualties = Math.min(unit.quantity, casualties - distributedCasualties);
      }

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
