import type { BattleUnits } from '@/types/typings';
import { stringifyObj } from '@/utils/numberFormatting';

import type UserModel from './Users';

/** A group of recovering units of one type/level. */
export interface WoundedUnitGroup {
  type: string;
  level: number;
  quantity: number;
  isMercenary: boolean;
}

/** Models battle result behavior and derived game data. */
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
    mitigation?: {
      averageMultiplier: number;
      minMultiplier: number;
      maxMultiplier: number;
      samples: number;
    };
    fortBreached?: boolean;
    battleStats?: { attacker: any; defender: any };
    wounded?: {
      attacker: WoundedUnitGroup[];
      defender: WoundedUnitGroup[];
    };
    routedStacks?: BattleResult['routedStacks'];
  };

  mitigationLog: Array<{
    turn: number;
    source: 'ATTACKER' | 'DEFENDER';
    attackType: 'MELEE' | 'RANGED';
    rawDamage: number;
    mitigatedDamage: number;
    fortSoakMultiplier: number;
    mitigationMultiplier: number;
    fortHpStart: number;
    fortHpEnd: number;
    fortHpRatio: number;
    defenderFortLevel?: number;
    defenderFortMitigationPct?: number;
    defenderCasualtyBonusPct?: number;
    defenderStructureMitigationPct?: number;
    totalMitigationPct?: number;
    fortBreached: boolean;
    includeCitz: boolean;
    includeOffense: boolean;
  }>;

  Losses: {
    Attacker: {
      total: number;
      units: BattleUnits[];
    };
    Defender: {
      total: number;
      units: BattleUnits[];
    };
  };

  /** Units removed from rosters but recovering: return via daily healing. */
  wounded: {
    attacker: WoundedUnitGroup[];
    defender: WoundedUnitGroup[];
  };

  /** Stacks that hit the per-battle casualty cap and were forced to withdraw. */
  routedStacks: Array<{
    side: 'Attacker' | 'Defender';
    type: string;
    level: number;
    lost: number;
    initialQuantity: number;
  }>;

  /** Single source of truth for the raid verdict; result/XP/logs derive from it. */
  canonicalOutcome?: {
    winner: 'ATTACKER' | 'DEFENDER';
    reason:
      | 'DEFENSE_WIPED'
      | 'FORT_BREACHED'
      | 'PROFITABLE_RAID'
      | 'ATTACKER_REPELLED'
      | 'DEFENDER_HELD';
    attackerValueLost: number;
    defenderValueLost: number;
    fortValueDamage: number;
    pillagedGoldValue: number;
    netGainValue: number;
    defenseUnitsBroken: number;
    dentRequiredUnits: number;
  };

  defenderStats: {
    defenseRemaining: number;
    meleeAtkPower: number;
    meleeDefPower: number;
    rangedAtkPower: number;
    rangedDefPower: number;
  };

  attackerStats: {
    offenseRemaining: number;
    meleeAtkPower: number;
    meleeDefPower: number;
    rangedAtkPower: number;
    rangedDefPower: number;
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
    this.mitigationLog = [];
    this.wounded = { attacker: [], defender: [] };
    this.routedStacks = [];
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
