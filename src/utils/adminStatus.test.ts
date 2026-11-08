import { describe, expect, it } from 'bun:test';

import { currentStatus, deriveAdminUserStatus } from '@/utils/adminStatus';

const now = new Date('2026-10-30T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const entry = (
  status: string,
  startOffset: number,
  endOffset: number | null,
) => ({
  status,
  start_date: new Date(now.getTime() + startOffset * day),
  end_date:
    endOffset === null ? null : new Date(now.getTime() + endOffset * day),
});

describe('currentStatus', () => {
  it('counts a timed ban until it expires', () => {
    // A 5-day ban started yesterday is still in force.
    const ban = entry('BANNED', -1, 4);
    expect(currentStatus([ban], now)).toBe('BANNED');
    expect(
      deriveAdminUserStatus({
        latestStatus: currentStatus([ban], now),
        lastActive: now,
        currentEraId: 1,
        activeEraId: 1,
      }),
    ).toBe('BANNED');
  });

  it('drops a sanction whose end date has passed', () => {
    expect(currentStatus([entry('SUSPENDED', -5, -1)], now)).toBeUndefined();
  });

  it('uses the latest started entry, not an older open-ended one', () => {
    const entries = [
      entry('SUSPENDED', -1, 2),
      entry('BANNED', -3, 4),
      entry('ACTIVE', -10, null),
    ];
    expect(currentStatus(entries, now)).toBe('SUSPENDED');
  });

  it('ignores entries that start in the future', () => {
    const entries = [entry('VACATION', 1, 15), entry('ACTIVE', -2, null)];
    expect(currentStatus(entries, now)).toBe('ACTIVE');
  });

  it('keeps permanent sanctions', () => {
    expect(currentStatus([entry('BANNED', -30, null)], now)).toBe('BANNED');
  });
});
