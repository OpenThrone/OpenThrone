import { describe, expect, it } from 'bun:test';

import { readUpdatedBonusPoints } from '@/utils/bonusPointsResponse';

const saved = [
  { type: 'OFFENSE', level: 3 },
  { type: 'DEFENSE', level: 1 },
];

describe('readUpdatedBonusPoints', () => {
  it('reads the levels from the API envelope (GitHub #319)', () => {
    expect(
      readUpdatedBonusPoints({
        message: 'Bonus points updated successfully',
        data: { updatedBonusPoints: saved },
      }),
    ).toEqual(saved);
  });

  it('still accepts an unwrapped payload', () => {
    expect(readUpdatedBonusPoints({ updatedBonusPoints: saved })).toEqual(
      saved,
    );
  });

  it('returns null instead of crashing on an unexpected shape', () => {
    expect(readUpdatedBonusPoints({ message: 'ok' })).toBeNull();
    expect(readUpdatedBonusPoints(null)).toBeNull();
    expect(
      readUpdatedBonusPoints({ data: { updatedBonusPoints: 'x' } }),
    ).toBeNull();
  });
});
