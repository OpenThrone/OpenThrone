import type { BattleUnits, PlayerUnit } from '@/types/typings';

import BattleSimulationResult from './BattleSimulationResult';
import type UserModel from './Users';
import { stringifyObj } from '@/utils/numberFormatting';
import result from '@/pages/account/password-reset/result';
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

  strength: any[];

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
