/** A mission with no affordable legal quantity has a zero selection. */
export function clampMissionQuantity(
  requested: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(max) || max < min) return 0;
  const value = Number.isFinite(requested) ? Math.floor(requested) : min;
  return Math.min(Math.floor(max), Math.max(min, value));
}
