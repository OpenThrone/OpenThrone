type FortStats = {
  fortDamage?: number | null;
  forthpAtStart?: number | null;
  forthpAtEnd?: number | null;
};

export type FortDamageSummary = {
  damage: number;
  start: number | null;
  end: number | null;
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Fort damage for a battle row, from the stored damage or the HP before and
 * after. Returns null when the log carries neither (spy missions, old logs).
 */
export function getFortDamageSummary(
  stats: FortStats | null | undefined,
): FortDamageSummary | null {
  if (!stats) return null;
  const start = finite(stats.forthpAtStart);
  const end = finite(stats.forthpAtEnd);
  const stored = finite(stats.fortDamage);
  const damage =
    stored ?? (start !== null && end !== null ? start - end : null);
  if (damage === null) return null;
  return { damage: Math.max(0, damage), start, end };
}
