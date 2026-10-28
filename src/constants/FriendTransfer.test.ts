import { describe, expect, it } from 'bun:test';

import {
  calculateFriendTransferFee,
  FRIEND_TRANSFER_ATTACK_BLOCK_HOURS,
  FRIEND_TRANSFER_FEE_PERCENT_BY_ECONOMY_LEVEL,
  FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS,
  getFriendTransferLimits,
} from '@/constants/FriendTransfer';

describe('getFriendTransferLimits', () => {
  it('returns null while GOLD_TRANSFER is locked', () => {
    expect(getFriendTransferLimits(0)).toBeNull();
    expect(getFriendTransferLimits(1)).toBeNull();
    expect(getFriendTransferLimits(2)).toBeNull();
    expect(getFriendTransferLimits(-1)).toBeNull();
  });

  it('maps each unlocked economy tier to its send/receive caps and fee', () => {
    expect(getFriendTransferLimits(3)).toEqual({
      sendPerDay: 150000n,
      receivePerDay: 50000n,
      feePercent: 10,
    });
    expect(getFriendTransferLimits(4)).toEqual({
      sendPerDay: 300000n,
      receivePerDay: 100000n,
      feePercent: 8,
    });
    expect(getFriendTransferLimits(5)).toEqual({
      sendPerDay: 600000n,
      receivePerDay: 250000n,
      feePercent: 5,
    });
    expect(getFriendTransferLimits(6)).toEqual({
      sendPerDay: 1250000n,
      receivePerDay: 500000n,
      feePercent: 3,
    });
  });

  it('uses the last tier for economy levels above the table', () => {
    expect(getFriendTransferLimits(7)).toEqual(getFriendTransferLimits(6));
    expect(getFriendTransferLimits(50)).toEqual(getFriendTransferLimits(6));
  });
});

describe('calculateFriendTransferFee', () => {
  it('charges each tier its percentage', () => {
    expect(calculateFriendTransferFee(1000n, 3)).toBe(100n);
    expect(calculateFriendTransferFee(1000n, 4)).toBe(80n);
    expect(calculateFriendTransferFee(1000n, 5)).toBe(50n);
    expect(calculateFriendTransferFee(1000n, 6)).toBe(30n);
  });

  it('floors fractional fees', () => {
    expect(calculateFriendTransferFee(999n, 3)).toBe(99n); // 99.9
    expect(calculateFriendTransferFee(5n, 6)).toBe(0n); // 0.15
    expect(calculateFriendTransferFee(1n, 4)).toBe(0n); // 0.08
  });

  it('uses the lowest fee above the table and charges nothing when locked', () => {
    expect(calculateFriendTransferFee(1000n, 7)).toBe(30n);
    expect(calculateFriendTransferFee(1000n, 100)).toBe(30n);
    expect(calculateFriendTransferFee(1000n, 0)).toBe(0n);
    expect(calculateFriendTransferFee(1000n, 2)).toBe(0n);
  });
});

describe('friend transfer anti-abuse constants', () => {
  it('keeps the windows the rules expect', () => {
    expect(FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS).toBe(7);
    expect(FRIEND_TRANSFER_ATTACK_BLOCK_HOURS).toBe(24);
  });

  it('keeps the fee ladder by economy level', () => {
    expect(FRIEND_TRANSFER_FEE_PERCENT_BY_ECONOMY_LEVEL).toEqual({
      3: 10,
      4: 8,
      5: 5,
      6: 3,
    });
  });
});
