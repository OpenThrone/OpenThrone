import { describe, expect, it } from 'bun:test';

import {
  MEMBER_DAILY_CAP_DEFAULT,
  memberDailyCapOf,
} from '@/constants/allianceTreasury';

describe('memberDailyCapOf', () => {
  it('reads the API serialization of a BigInt ("5000000n")', () => {
    expect(memberDailyCapOf('7500000n')).toBe(7_500_000);
  });

  it('reads plain strings, numbers and bigints', () => {
    expect(memberDailyCapOf('250000')).toBe(250_000);
    expect(memberDailyCapOf(300_000)).toBe(300_000);
    expect(memberDailyCapOf(400_000n)).toBe(400_000);
  });

  it('falls back to the default for missing or unreadable values', () => {
    expect(memberDailyCapOf(undefined)).toBe(MEMBER_DAILY_CAP_DEFAULT);
    expect(memberDailyCapOf(null)).toBe(MEMBER_DAILY_CAP_DEFAULT);
    expect(memberDailyCapOf('')).toBe(MEMBER_DAILY_CAP_DEFAULT);
    expect(memberDailyCapOf('abc')).toBe(MEMBER_DAILY_CAP_DEFAULT);
  });
});
