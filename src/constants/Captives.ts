// Captives and the Dungeon (#210, phase 4 of #205) tuning.
// Client-safe: pure constants and pure functions only — no env, no database.

import { distributeDesertion } from '@/constants/KingdomMorale';
import { UnitTypes } from '@/constants/Units';

/** Share of the defender's killed combat units taken captive instead of dying. */
export const CAPTURE_PERCENT = 0.1;
/**
 * Fort level that unlocks the dungeon. Mirrors
 * FEATURE_REQUIREMENTS.DUNGEON.fortLevel in FeatureUnlocks.ts.
 */
export const DUNGEON_FORT_LEVEL = 13;
/** Captives a fort at the unlock level holds. */
export const DUNGEON_BASE_CAPACITY = 200;
/** Extra captive capacity per fort level above the unlock level. */
export const DUNGEON_CAPACITY_PER_LEVEL = 50;
/** Ransom price as a share of the unit's base cost (paid by the source). */
export const RANSOM_PERCENT = 0.4;
/** Share of the ransom the captor keeps; the rest is burned (anti gold-funnel). */
export const RANSOM_CAPTOR_SHARE = 0.5;
/** Morale the source gains when the captor releases their troops. */
export const RELEASE_MORALE = 2;
/** Hours captives must sit in the dungeon before they may be converted. */
export const CONVERT_MIN_HOURS = 72;
/** Conversion cost as a share of the unit's base cost (paid by the captor). */
export const CONVERT_COST_PERCENT = 0.25;
/** Days after which captives escape back to their source as citizens. */
export const CAPTIVE_MAX_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Combat unit types that can be taken captive; citizens and workers never are. */
const CAPTURABLE_UNIT_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;

export const isCapturableUnitType = (type: string): boolean =>
  (CAPTURABLE_UNIT_TYPES as readonly string[]).includes(type);

/** One row of a side's killed units, as the battle engine records it. */
export interface CapturableFallenRow {
  type: string;
  level: number;
  quantity: number;
  isMercenary?: boolean;
  /**
   * The temporary force the row fought under, if any (an alliance contingent
   * or a mercenary contract). Force rows belong to their sender, not to the
   * defender's army, so they can never be captured — whatever the
   * isMercenary flag says.
   */
  forceKind?: 'MERCENARY' | 'ALLIANCE';
}

/**
 * The killed rows a dungeon may take captives from: trained combat units of
 * the defender's own army only. Mercenaries and any row flagged with a
 * forceKind (an alliance contingent or other temporary force, even one
 * recorded without the mercenary flag) are not the defender's to give, so
 * neither can be taken; citizens and workers never are.
 */
export function capturableCombatRows(
  killedUnits: readonly CapturableFallenRow[],
): CapturableFallenRow[] {
  return killedUnits.filter(
    (row) =>
      !row.isMercenary &&
      !row.forceKind &&
      isCapturableUnitType(row.type) &&
      row.quantity > 0,
  );
}

/** Total dungeon capacity at a fort level: 200 at level 13, +50 per level above. */
export function dungeonCapacity(fortLevel: number): number {
  const level = Math.max(0, Math.floor(Number(fortLevel) || 0));
  return (
    DUNGEON_BASE_CAPACITY +
    Math.max(0, level - DUNGEON_FORT_LEVEL) * DUNGEON_CAPACITY_PER_LEVEL
  );
}

/**
 * Captives taken from a battle: 10% of the defender's killed combat units,
 * rounded once on the battle total (never per row), so splitting stacks into
 * many small rows cannot dodge the round-down.
 */
export function captureQuantity(killedCombatUnits: number): number {
  const killed = Math.max(0, Math.floor(Number(killedCombatUnits) || 0));
  return Math.floor(killed * CAPTURE_PERCENT);
}

/**
 * Splits one battle's captives across the killed unit rows proportionally
 * (largest-remainder method — the same split the desertion pass uses), so a
 * defender cannot dodge captures by splitting armies into many small stacks.
 */
export const distributeCaptures = distributeDesertion;

/** Ransom price for a single captive, in gold: 40% of the unit's base cost. */
export function ransomPricePerUnit(
  unitType: string,
  unitLevel: number,
): bigint {
  const unit = UnitTypes.find(
    (candidate) => candidate.type === unitType && candidate.level === unitLevel,
  );
  return BigInt(Math.ceil((unit?.cost ?? 0) * RANSOM_PERCENT));
}

/** Gold cost of converting a single captive: 25% of the unit's base cost. */
export function convertCostPerUnit(
  unitType: string,
  unitLevel: number,
): bigint {
  const unit = UnitTypes.find(
    (candidate) => candidate.type === unitType && candidate.level === unitLevel,
  );
  return BigInt(Math.ceil((unit?.cost ?? 0) * CONVERT_COST_PERCENT));
}

/** The captor's half of a ransom; the remainder is burned, never pocketed. */
export function captorRansomShare(ransomTotal: bigint): bigint {
  return (ransomTotal * BigInt(Math.round(RANSOM_CAPTOR_SHARE * 100))) / 100n;
}

/** When a capture first becomes convertible. */
export function convertReadyAt(capturedAt: Date): Date {
  return new Date(new Date(capturedAt).getTime() + CONVERT_MIN_HOURS * HOUR_MS);
}

/** When a capture escapes back to its source as citizens. */
export function escapesAt(capturedAt: Date): Date {
  return new Date(new Date(capturedAt).getTime() + CAPTIVE_MAX_DAYS * DAY_MS);
}

/**
 * The highest tier of a unit type at or below `unitLevel` that `fortLevel`
 * unlocks (the same tier rule assertForceTierUnlocked enforces). Converted
 * captives and received defectors never keep a tier the receiving fort has
 * not unlocked; level 1 is always available.
 */
export function demotedUnitLevel(
  unitType: string,
  unitLevel: number,
  fortLevel: number,
): number {
  const level = Math.max(1, Math.floor(Number(unitLevel) || 1));
  const fort = Math.max(1, Math.floor(Number(fortLevel) || 0));
  const unlocked = UnitTypes.filter(
    (candidate) =>
      candidate.type === unitType &&
      candidate.level <= level &&
      (candidate.fortLevel ?? 1) <= fort,
  );
  if (unlocked.length === 0) return 1;
  return unlocked.reduce((max, candidate) => Math.max(max, candidate.level), 1);
}
