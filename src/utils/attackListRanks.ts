/** Columns the Attack list can rank players by. */
export type AttackListSort = 'gold' | 'population' | 'level' | string;

export type RankablePlayer = {
  id: number;
  rank?: number | null;
  gold?: string | number | bigint | null;
  population?: number | null;
  experience?: number | null;
};

const metric = (player: RankablePlayer, sortBy: AttackListSort): number => {
  switch (sortBy) {
    case 'gold':
      return Number(player.gold ?? 0);
    case 'population':
      return Number(player.population ?? 0);
    case 'level':
      return Number(player.experience ?? 0);
    default:
      return 0;
  }
};

/** Stored overall rank; players not ranked yet (0) come after everyone ranked. */
const overall = (player: RankablePlayer) => {
  const rank = Number(player.rank);
  return Number.isFinite(rank) && rank > 0 ? rank : Number.POSITIVE_INFINITY;
};

/**
 * Best-first order for a column: the column's value, then the stored overall
 * rank, then id, so ties always resolve the same way.
 */
export const compareForRank =
  (sortBy: AttackListSort) => (a: RankablePlayer, b: RankablePlayer) =>
    metric(b, sortBy) - metric(a, sortBy) ||
    overall(a) - overall(b) ||
    a.id - b.id;

/**
 * Rank of every player by the sorted column, over the whole list (not the
 * filtered page), so each rank appears once and the rows match "Your rank"
 * (#275). New players keep a stored rank of 0 until the next turn, which used
 * to fall back to their row position and duplicate someone's #1.
 */
export const getAttackListRanks = (
  players: readonly RankablePlayer[],
  sortBy: AttackListSort,
): Map<number, number> => {
  const ranked = [...players].sort(compareForRank(sortBy));
  return new Map(ranked.map((player, index) => [player.id, index + 1]));
};
