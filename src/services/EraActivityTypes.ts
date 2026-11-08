export const ERA_TOP_BATTLE_LIMIT = 10;

export type EraTopBattle = {
  attackerId: number;
  defenderId: number;
  casualties: number;
};

export const parseTopBattles = (value: unknown): EraTopBattle[] =>
  Array.isArray(value) ? (value as EraTopBattle[]) : [];

export const mergeTopBattles = (...lists: EraTopBattle[][]): EraTopBattle[] =>
  lists
    .flat()
    .sort((a, b) => b.casualties - a.casualties)
    .slice(0, ERA_TOP_BATTLE_LIMIT);
