import { describe, expect, it } from 'bun:test';

import { DEPOSIT_CAP_PERCENT, getMaxDeposit } from './bankLimits';

describe('bankLimits', () => {
  it('exports DEPOSIT_CAP_PERCENT as 80', () => {
    expect(DEPOSIT_CAP_PERCENT).toBe(80);
  });

  describe('getMaxDeposit', () => {
    it('returns 0n for 0n gold', () => {
      expect(getMaxDeposit(0n)).toBe(0n);
    });

    it('returns 0n for negative gold', () => {
      expect(getMaxDeposit(-1n)).toBe(0n);
      expect(getMaxDeposit(-100n)).toBe(0n);
    });

    it('returns 0n for 1n gold', () => {
      expect(getMaxDeposit(1n)).toBe(0n);
    });

    it('returns 3n for 4n gold', () => {
      expect(getMaxDeposit(4n)).toBe(3n);
    });

    it('returns 4n for 5n gold', () => {
      expect(getMaxDeposit(5n)).toBe(4n);
    });

    it('returns 80n for 100n gold', () => {
      expect(getMaxDeposit(100n)).toBe(80n);
    });

    it('returns 80n for 101n gold', () => {
      expect(getMaxDeposit(101n)).toBe(80n);
    });

    it('handles values above Number.MAX_SAFE_INTEGER with exact bigint precision', () => {
      const largeGold = 9007199254740993n * 10n;
      const expected = (largeGold * 80n) / 100n;
      expect(getMaxDeposit(largeGold)).toBe(expected);
      expect(getMaxDeposit(largeGold)).toBe(72057594037927944n);
    });
  });
});
