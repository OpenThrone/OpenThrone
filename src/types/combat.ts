/**
 * Equipment and native ranged power identify a formation's role.
 * Both channels retain their actual stats; role labels never discard melee or ranged pressure.
 * COLLATERAL citizens/workers are exposed to losses only after a breach.
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

/** Homogeneous covered/uncovered group produced by shared army-wide equipment allocation. */
export interface BattleFormation {
  /** Unit type (OFFENSE, DEFENSE, CITIZEN, WORKER, etc.) */
  type: string;
  /** Unit level (1, 2, 3) */
  level: number;
  /** Native/equipped ranged capability, or civilian collateral */
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
