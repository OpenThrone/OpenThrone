import { getGameDayMs } from '@/utils/timefunctions';
import { getLevelFromXP } from '@/utils/utilities';

/**
 * `users.level_reached_at` (#334): when the player reached their current
 * level. Level derives from experience, so every write that changes
 * experience spreads this into its update: it stamps the time only when the
 * level actually moved, and leaves the column alone for a same-level gain.
 */
export function levelReachedAtUpdate(
  experienceBefore: number,
  experienceAfter: number,
  now: Date = new Date(),
): { level_reached_at?: Date } {
  const before = getLevelFromXP(Math.max(0, Number(experienceBefore) || 0));
  const after = getLevelFromXP(Math.max(0, Number(experienceAfter) || 0));
  return before === after ? {} : { level_reached_at: now };
}

/**
 * Whole and partial game days since the player reached their level; null
 * (never stamped) reads as just reached. Feeds the combat-v11 anti-camping
 * defender XP ramp.
 */
export function gameDaysAtLevel(
  levelReachedAt: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  if (!levelReachedAt) return 0;
  const since = new Date(levelReachedAt).getTime();
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, (now.getTime() - since) / Math.max(1, getGameDayMs()));
}
