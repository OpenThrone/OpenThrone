import { BattleUnits, PlayerUnit, UnitType } from './typings';

// Re-export existing types for convenience
export type { BattleUnits, PlayerUnit, UnitType };

// StaminaState: Represents the current stamina state of a user
export interface StaminaState {
  current: number;
  max: number;
  regenerationRate: number; // Stamina points regenerated per turn or time unit
}

// AttackRecord: Represents a record of an attack based on attack_log
export interface AttackRecord {
  id: number;
  attackerId: number;
  defenderId: number;
  winner: number; // User ID of the winner, or 0 for undecided
  stats: any; // JSON stats from the battle
  type: string; // e.g., 'attack'
  timestamp: Date | null;
}

// StaminaModifiers: Represents factors that modify stamina regeneration or consumption
export interface StaminaModifiers {
  baseRegeneration: number; // Base regeneration rate
  bonuses: Record<string, number>; // Key-value pairs for various bonuses (e.g., 'upgrade': 5)
  penalties: Record<string, number>; // Key-value pairs for penalties
}

// BattleResult: Interface for the BattleResult class properties
export interface BattleResultInterface {
  attacker: any; // UserModel, but using any for simplicity
  defender: any; // UserModel
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
      units: BattleUnits[];
    };
    Defender: {
      total: number;
      units: BattleUnits[];
    };
  };
}

// BreachState: Represents the state of breaching a fort or defense
export interface BreachState {
  breached: boolean; // Whether the breach has been successful
  turnsToBreach: number; // Number of turns required to breach
  breachDamage: number; // Additional damage from breach
  breachChance: number; // Probability of successful breach per turn
}

// Additional types for completeness
export interface CombatStats {
  offense: number;
  defense: number;
  spy: number;
  sentry: number;
}

export interface FortState {
  level: number;
  hitpoints: number;
  maxHitpoints: number;
  repairCost: number;
}