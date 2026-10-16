/** Only players who have returned since this era began may be attacked. */
export function hasParticipatedInEra(
  lastActive: Date | string | null | undefined,
  eraStart: Date | string | null | undefined,
): boolean {
  if (!lastActive || !eraStart) return false;
  const active = new Date(lastActive).getTime();
  const start = new Date(eraStart).getTime();
  return Number.isFinite(active) && Number.isFinite(start) && active >= start;
}

/**
 * Era resets archive a record for every account, so a finished era's record
 * still exists for players who never played it. Treat a record that never left
 * level 1 and never won an attack as non-participation (defends can be won
 * passively by being attacked, so they do not count).
 */
export function tookPartInArchivedEra(
  achievements: Record<string, unknown> | null | undefined,
): boolean {
  const level = Number(achievements?.maxLevelReached ?? 0);
  const attacksWon = Number(achievements?.totalAttacksWon ?? 0);
  return level > 1 || attacksWon > 0;
}
