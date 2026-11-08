import { OffensiveUpgrades } from '@/constants/Structure_Upgrades';

/** Stamina is expressed as a percentage. */
export const STAMINA_MAX = 100;
/** Offense starts losing power below this stamina. */
export const STAMINA_PENALTY_THRESHOLD = 50;
/** Minimum offense multiplier at zero stamina. */
export const STAMINA_FATIGUE_MIN_MULTIPLIER = 0.8;

/** Return the attacker's offense multiplier, with optional server tuning. */
export function attackerStaminaMultiplier(
  stamina: number,
  threshold = STAMINA_PENALTY_THRESHOLD,
  minimum = STAMINA_FATIGUE_MIN_MULTIPLIER,
): number {
  if (!Number.isFinite(stamina)) return 1;
  const value = Math.max(0, Math.min(STAMINA_MAX, stamina));
  const limit = Math.max(0, Math.min(STAMINA_MAX, threshold));
  const floor = Math.max(0, Math.min(1, minimum));
  if (limit === 0 || value >= limit) return 1;
  return floor + (1 - floor) * (value / limit);
}

/** Whole-percent offense penalty for battle reports. */
export function attackerStaminaPercent(
  stamina: number,
  threshold = STAMINA_PENALTY_THRESHOLD,
  minimum = STAMINA_FATIGUE_MIN_MULTIPLIER,
): number {
  return Math.round(
    (1 - attackerStaminaMultiplier(stamina, threshold, minimum)) * 100,
  );
}

/** Player-facing condition band using the default thresholds. */
export function getArmyStaminaState(
  stamina: number,
  threshold = STAMINA_PENALTY_THRESHOLD,
): 'rested' | 'weary' | 'exhausted' {
  if (!Number.isFinite(stamina) || stamina >= threshold) return 'rested';
  return stamina >= threshold / 2 ? 'weary' : 'exhausted';
}

/** Offense structures reduce the drain per committed turn from one to one half. */
export function staminaDrainFactor(offenseUpgradeLevel: number): number {
  const top = Math.max(...OffensiveUpgrades.map((upgrade) => upgrade.level));
  const level = Number.isFinite(offenseUpgradeLevel) ? offenseUpgradeLevel : 1;
  const bounded = Math.max(1, Math.min(top, level));
  return top <= 1 ? 1 : 1 - 0.5 * ((bounded - 1) / (top - 1));
}
