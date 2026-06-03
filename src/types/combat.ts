import type { BattleUnits, PlayerUnit, UnitType } from './typings';

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

// ============================================================
// Battle Formation Types (Melee/Ranged Unit Split)
// ============================================================

/**
 * A unit's combat role is determined by its equipped WEAPON at battle start.
 * - RANGED: unit has a weapon with RangedAtkPower > 0
 * - MELEE: unit has no weapon, or weapon has RangedAtkPower === 0
 * - COLLATERAL: citizens/workers (non-combatants, only targeted when fort is breached)
 *
 * Once assigned, roles never change during a battle.
 */
export type CombatRole = 'MELEE' | 'RANGED' | 'COLLATERAL';

/**
 * Per-unit combat stats computed from base unit stats + items + battle upgrades.
 * These are "per individual unit" values — multiply by quantity for formation totals.
 */
export interface PerUnitCombatStats {
  MeleeAtkPower: number;
  MeleeDefPower: number;
  RangedAtkPower: number;
  RangedDefPower: number;
}

/**
 * A homogeneous formation group within a battle army.
 * All units in a formation share the same type, level, role, and per-unit stats.
 * Formations are built once at battle start and never rescrambled.
 */
export interface BattleFormation {
  /** Unit type (OFFENSE, DEFENSE, CITIZEN, WORKER, etc.) */
  type: string;
  /** Unit level (1, 2, 3) */
  level: number;
  /** Combat role assigned at battle start based on equipped weapon */
  combatRole: CombatRole;
  /** Number of living units in this formation */
  quantity: number;
  /** HP of the currently-engaged unit (remaining units reset to maxHP) */
  currentHP: number;
  /** Max HP per unit (from UnitTypes) */
  maxHP: number;
  /** Per-unit combat stats (base + items + upgrades) */
  perUnitStats: PerUnitCombatStats;
  /** Whether this formation represents mercenary units */
  isMercenary: boolean;
}

/**
 * Complete army state for one side of a battle, organized by formations.
 * Built once at battle start, updated only by reducing quantities on casualties.
 */
export interface BattleArmyState {
  /** Combat formations (OFFENSE/DEFENSE units split by role) */
  formations: BattleFormation[];
  /** Collateral formations (CITIZEN/WORKER — only targeted when fort is breached) */
  collateral: BattleFormation[];
}

/**
 * Aggregated combat strength from a set of formations, split by role.
 */
export interface FormationStrength {
  meleeAtkPower: number;
  meleeDefPower: number;
  rangedAtkPower: number;
  rangedDefPower: number;
}
