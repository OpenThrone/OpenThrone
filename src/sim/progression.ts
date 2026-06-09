import { levelXPArray } from '../constants/XPLevels';

/** Returns xp floor for level for callers that need normalized game data. */
export function getXpFloorForLevel(level: number): number {
  if (level <= 1) return 0;
  return levelXPArray.find((entry) => entry.level === level)?.xp ?? 0;
}

/** Returns level from sim xp for callers that need normalized game data. */
export function getLevelFromSimXp(xp: number): number {
  for (const entry of levelXPArray) {
    if (xp < entry.xp) {
      return Math.max(1, entry.level - 1);
    }
  }
  return levelXPArray[levelXPArray.length - 1]?.level ?? 100;
}

function getXpRequiredForNextLevel(level: number, xp: number): number {
  const nextThreshold =
    levelXPArray.find((entry) => entry.level === level + 1)?.xp ?? Infinity;
  return Math.max(0, nextThreshold - xp);
}

/** Get xp remaining to level100. */
export function getXpRemainingToLevel100(xp: number): number {
  const level100Xp = levelXPArray.find((entry) => entry.level === 100)?.xp ?? 0;
  return Math.max(0, level100Xp - xp);
}

/** Describes the progression pacing input data contract. */
export interface ProgressionPacingInput {
  id: string;
  displayName: string;
  started: {
    day: number;
  };
  final: {
    day: number;
    xp: number;
  };
  deltas: {
    xp: number;
  };
}

/** Describes the progression pacing summary data contract. */
export interface ProgressionPacingSummary {
  avgXpPerDay: number;
  pacingPlayerId: string | null;
  pacingPlayerName: string | null;
  projectedDaysToLevel100: number | null;
  projectedMonthsToLevel100: number | null;
}

/** Calculates progression pacing used by combat, economy, or presentation logic. */
export function calculateProgressionPacing(
  playerProgress: ProgressionPacingInput[],
): ProgressionPacingSummary {
  const bestPace = playerProgress.reduce<{
    player: ProgressionPacingInput;
    xpPerDay: number;
  } | null>((best, player) => {
    const elapsedDays = Math.max(1, player.final.day - player.started.day);
    const xpPerDay = player.deltas.xp / elapsedDays;
    if (xpPerDay <= 0) return best;
    if (best == null || xpPerDay > best.xpPerDay) return { player, xpPerDay };
    return best;
  }, null);

  if (bestPace == null) {
    return {
      avgXpPerDay: 0,
      pacingPlayerId: null,
      pacingPlayerName: null,
      projectedDaysToLevel100: null,
      projectedMonthsToLevel100: null,
    };
  }

  const projectedDaysToLevel100 =
    getXpRemainingToLevel100(bestPace.player.final.xp) / bestPace.xpPerDay;

  return {
    avgXpPerDay: bestPace.xpPerDay,
    pacingPlayerId: bestPace.player.id,
    pacingPlayerName: bestPace.player.displayName,
    projectedDaysToLevel100,
    projectedMonthsToLevel100: projectedDaysToLevel100 / 30.4375,
  };
}
