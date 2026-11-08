import { describe, expect, it } from 'bun:test';

import {
  DEPOSIT_CAP_PERCENT,
  depositLimitNotes,
  getBankRoom,
  getMaxDeposit,
} from './bankLimits';

describe('bankLimits', () => {
  it('exports DEPOSIT_CAP_PERCENT as 80', () => {
    expect(DEPOSIT_CAP_PERCENT).toBe(80);
  });

  describe('getBankRoom', () => {
    it('is the capacity left above the balance', () => {
      expect(getBankRoom(100n, 30n)).toBe(70n);
    });
    it('is zero for a balance at or above capacity', () => {
      expect(getBankRoom(100n, 100n)).toBe(0n);
      expect(getBankRoom(100n, 150n)).toBe(0n);
    });
  });

  describe('getMaxDeposit', () => {
    it('never exceeds the room left in the bank', () => {
      expect(getMaxDeposit(1000n, 80, 50n)).toBe(50n);
      expect(getMaxDeposit(1000n, 80, 0n)).toBe(0n);
    });
    it('keeps the percent limit when the bank has more room', () => {
      expect(getMaxDeposit(1000n, 80, 900n)).toBe(800n);
    });
    it('uses a configured cap', () => {
      expect(getMaxDeposit(100n, 50)).toBe(50n);
    });
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

describe('depositLimitNotes (#299)', () => {
  const t = (key: string, o?: Record<string, unknown>) =>
    `${key}:${JSON.stringify(o)}`;

  it('names the window length even while a countdown runs', () => {
    const notes = depositLimitNotes(t, 4, 1, 3, { hours: 0, minutes: 9 });
    expect(notes).toEqual([
      'bank.rollingDepositLimit:{"hours":4}',
      'bank.nextDepositIn:{"hours":0,"minutes":"09"}',
    ]);
  });

  it('shows only the window when every deposit is free', () => {
    expect(depositLimitNotes(t, 4, 3, 3, { hours: 1, minutes: 0 })).toEqual([
      'bank.rollingDepositLimit:{"hours":4}',
    ]);
  });
});
