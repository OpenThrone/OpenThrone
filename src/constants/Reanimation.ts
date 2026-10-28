// Undead reanimation (#211, phase 5 of #205) tuning.
// Client-safe: pure constants and pure functions only — no env, no database.

import { distributeDesertion } from '@/constants/KingdomMorale';

/** Share of the Undead player's OWN killed combat units that rises again. */
export const OWN_REANIMATION_PERCENT = 0.08;
/** Share of the OPPONENT's killed combat units that rises again. */
export const ENEMY_REANIMATION_PERCENT = 0.04;
/** Percentage points both shares gain per fort level above the unlock level. */
export const REANIMATION_PERCENT_PER_FORT_LEVEL = 0.005;
/** Hard cap of the own-dead share's fort-level scaling (reached at fort 19). */
export const OWN_REANIMATION_PERCENT_MAX = 0.15;
/** Hard cap of the enemy-dead share's fort-level scaling (reached at fort 13). */
export const ENEMY_REANIMATION_PERCENT_MAX = 0.08;
/**
 * Fort level that unlocks reanimation. Mirrors
 * FEATURE_REQUIREMENTS.REANIMATION.fortLevel in FeatureUnlocks.ts.
 */
export const REANIMATION_FORT_LEVEL = 5;
/** Share of the Undead player's trained combat army that may rise per OT day. */
export const REANIMATION_DAILY_CAP_PERCENT = 0.02;
/** Whatever tier they fell from, the risen come back at this level. */
export const REANIMATED_UNIT_LEVEL = 1;

/** Combat unit types that can rise again; citizens and workers never do. */
const REANIMATABLE_UNIT_TYPES = [
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
] as const;

export const isReanimatableUnitType = (type: string): boolean =>
  (REANIMATABLE_UNIT_TYPES as readonly string[]).includes(type);

/** One row of a side's killed units, as the battle engine records it. */
export interface ReanimationFallenRow {
  type: string;
  level: number;
  quantity: number;
  isMercenary?: boolean;
  /**
   * The temporary force the row fought under, if any (an alliance contingent
   * or a mercenary contract). Force rows are never the player's own dead, so
   * they never rise — whatever the isMercenary flag says.
   */
  forceKind?: 'MERCENARY' | 'ALLIANCE';
}

/** Fort levels above the unlock level (nothing below it can have the feature). */
const levelsAboveUnlock = (fortLevel: number): number =>
  Math.max(0, Math.floor(Number(fortLevel) || 0) - REANIMATION_FORT_LEVEL);

/** Own-dead share at a fort level: 8% at level 5, +0.5pp per level, max 15%. */
export function ownReanimationPercent(fortLevel: number): number {
  return Math.min(
    OWN_REANIMATION_PERCENT_MAX,
    OWN_REANIMATION_PERCENT +
      levelsAboveUnlock(fortLevel) * REANIMATION_PERCENT_PER_FORT_LEVEL,
  );
}

/** Enemy-dead share at a fort level: 4% at level 5, +0.5pp per level, max 8%. */
export function enemyReanimationPercent(fortLevel: number): number {
  return Math.min(
    ENEMY_REANIMATION_PERCENT_MAX,
    ENEMY_REANIMATION_PERCENT +
      levelsAboveUnlock(fortLevel) * REANIMATION_PERCENT_PER_FORT_LEVEL,
  );
}

/** Units rising from one fallen total, floored once on that total. */
export function reanimationQuantity(
  fallenCombatUnits: number,
  percent: number,
): number {
  const fallen = Math.max(0, Math.floor(Number(fallenCombatUnits) || 0));
  return Math.floor(fallen * Math.max(0, Number(percent) || 0));
}

/** The Undead player's own fallen that rise at a given fort level. */
export function ownReanimationQuantity(
  fallenCombatUnits: number,
  fortLevel: number,
): number {
  return reanimationQuantity(
    fallenCombatUnits,
    ownReanimationPercent(fortLevel),
  );
}

/** The opponent's fallen that rise for the Undead player at a fort level. */
export function enemyReanimationQuantity(
  fallenCombatUnits: number,
  fortLevel: number,
): number {
  return reanimationQuantity(
    fallenCombatUnits,
    enemyReanimationPercent(fortLevel),
  );
}

/** The day's cap: 2% of the trained combat army, floored. */
export function reanimationDailyCap(trainedCombatArmy: number): number {
  const army = Math.max(0, Math.floor(Number(trainedCombatArmy) || 0));
  return Math.floor(army * REANIMATION_DAILY_CAP_PERCENT);
}

/**
 * Splits one pool's reanimated units across the fallen rows proportionally
 * (largest-remainder method — the same split the desertion pass and the
 * captives hook use), so splitting stacks into many small rows can neither
 * dodge the share nor farm extra risers.
 */
export const distributeReanimation = distributeDesertion;

/**
 * The rows that are truly dead: the killed combat rows of the player's own
 * army — mercenaries and any temporary-force row (an alliance contingent or
 * other contract force, flagged by forceKind) are nobody's dead and never
 * rise — with the captives the attacker's dungeon took removed — a captive
 * sits in a dungeon, not in a grave, so it neither rises for the Undead
 * attacker's enemy pool nor for the Undead defender's own pool. The captured
 * split re-derives the exact largest-remainder split CaptiveService.captureFromBattle
 * used on the same rows, so the two hooks always agree without sharing state.
 */
export function deadCombatRows(
  killedUnits: readonly ReanimationFallenRow[],
  capturedTotal: number,
): ReanimationFallenRow[] {
  const rows = killedUnits.filter(
    (row) =>
      !row.isMercenary &&
      !row.forceKind &&
      isReanimatableUnitType(row.type) &&
      row.quantity > 0,
  );
  const killedTotal = rows.reduce((sum, row) => sum + row.quantity, 0);
  const captured = Math.min(
    Math.max(0, Math.floor(Number(capturedTotal) || 0)),
    killedTotal,
  );
  if (captured === 0) return rows.map((row) => ({ ...row }));
  const takes = distributeReanimation(
    rows.map((row) => row.quantity),
    captured,
  );
  return rows
    .map((row, index) => ({ ...row, quantity: row.quantity - takes[index] }))
    .filter((row) => row.quantity > 0);
}
