import type { BonusPointsItem } from '@/types/typings';

/**
 * Reads the saved levels from a POST /api/account/bonusPoints response, which
 * wraps them as `{ message, data: { updatedBonusPoints } }`. Returns null when
 * the shape is unexpected so the Levels page keeps its current state instead
 * of crashing (GitHub #319: the page read the top-level field and crashed
 * after a successful save).
 */
export const readUpdatedBonusPoints = (
  payload: unknown,
): BonusPointsItem[] | null => {
  const body = payload as {
    data?: { updatedBonusPoints?: unknown };
    updatedBonusPoints?: unknown;
  } | null;
  const updated = body?.data?.updatedBonusPoints ?? body?.updatedBonusPoints;
  return Array.isArray(updated) ? (updated as BonusPointsItem[]) : null;
};
