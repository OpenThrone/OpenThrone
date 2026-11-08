type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Time until the next attack opens, rounded up: "3h 30m" or "5m". */
export function formatPairCapWait(
  opensAt: Date,
  now: Date = new Date(),
): string {
  const totalMinutes = Math.max(
    1,
    Math.ceil((opensAt.getTime() - now.getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The pair-cap refusal in the player's language (#359). The wait is worked out
 * here so it is current when shown. Returns null when the reply lacks the
 * details, and the caller keeps the server's own text.
 */
export function pairCapRefusalText(
  t: Translate,
  extra: { limit?: unknown; nextAttackAt?: unknown } | null | undefined,
  now: Date = new Date(),
): string | null {
  const opensAt = new Date(String(extra?.nextAttackAt));
  if (typeof extra?.limit !== 'number' || Number.isNaN(opensAt.getTime()))
    return null;
  return t('attack.pairCapReached', {
    limit: extra.limit,
    wait: formatPairCapWait(opensAt, now),
  });
}
