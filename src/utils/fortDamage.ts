/** Header wall artwork for a fort's health: 0 intact, 1 cracked, 2 breached, 3 ruined. */
export type FortDamageTier = 0 | 1 | 2 | 3;

export const FORT_DAMAGE_TIERS: readonly FortDamageTier[] = [0, 1, 2, 3];

/** Unknown health (logged out, still loading) shows the intact wall. */
export function getFortDamageTier(
  percentage: number | null | undefined,
): FortDamageTier {
  if (percentage == null || !Number.isFinite(percentage) || percentage >= 75)
    return 0;
  if (percentage >= 50) return 1;
  if (percentage >= 25) return 2;
  return 3;
}
