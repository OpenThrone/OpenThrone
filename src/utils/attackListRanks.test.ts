import { describe, expect, it } from 'bun:test';

import { compareForRank, getAttackListRanks } from '@/utils/attackListRanks';

describe('getAttackListRanks', () => {
  // HaikuOwl was ranked on the last turn; OpusRex signed up after it (rank 0).
  const players = [
    { id: 4, rank: 0, experience: 0, gold: '0', population: 50 },
    { id: 3, rank: 1, experience: 0, gold: '1050', population: 50 },
  ];

  it('gives tied level-1 players distinct ranks (#275)', () => {
    const ranks = getAttackListRanks(players, 'level');
    expect(ranks.get(3)).toBe(1);
    expect(ranks.get(4)).toBe(2);
    expect(new Set(ranks.values()).size).toBe(players.length);
  });

  it('orders the list the same way it ranks it', () => {
    const order = [...players].sort(compareForRank('level')).map((p) => p.id);
    const ranks = getAttackListRanks(players, 'level');
    expect(order.map((id) => ranks.get(id))).toEqual([1, 2]);
  });

  it('ranks by the sorted column first', () => {
    const ranks = getAttackListRanks(
      [
        { id: 1, rank: 1, gold: '10' },
        { id: 2, rank: 2, gold: '500' },
      ],
      'gold',
    );
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(1)).toBe(2);
  });
});
