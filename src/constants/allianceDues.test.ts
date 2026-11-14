import { describe, expect, it } from 'bun:test';

import {
  ALLIANCE_DUES_MAX,
  ALLIANCE_JOIN_FEE_MAX,
  getDuesPeriodStart,
  getNextDuesCollection,
  toDuesBigInt,
  validateAllianceDuesSettings,
} from '@/constants/allianceDues';

// Wednesday 12 November 2026, 10:00 in New York (EST, UTC-5).
const WEDNESDAY = new Date('2026-11-12T15:00:00.000Z');

describe('alliance dues rules', () => {
  it('holds the owner-approved maximums', () => {
    expect(ALLIANCE_JOIN_FEE_MAX).toBe(10_000_000n);
    expect(ALLIANCE_DUES_MAX).toEqual({
      DAILY: 1_000_000n,
      WEEKLY: 5_000_000n,
      MONTHLY: 20_000_000n,
    });
  });

  it('pairs an amount with a period', () => {
    const ok = { joinFee: 0n, duesAmount: 0n, duesPeriod: 'NONE' as const };
    expect(validateAllianceDuesSettings(ok)).toBeNull();
    expect(
      validateAllianceDuesSettings({ ...ok, duesAmount: 1n }),
    ).not.toBeNull();
    expect(
      validateAllianceDuesSettings({ ...ok, duesPeriod: 'DAILY' }),
    ).not.toBeNull();
    expect(
      validateAllianceDuesSettings({
        ...ok,
        duesAmount: 1_000_000n,
        duesPeriod: 'DAILY',
      }),
    ).toBeNull();
    expect(
      validateAllianceDuesSettings({ ...ok, joinFee: -1n }),
    ).not.toBeNull();
  });

  it('starts periods at OT midnight, Monday and the 1st', () => {
    expect(getDuesPeriodStart('DAILY', WEDNESDAY)?.toISOString()).toBe(
      '2026-11-12T05:00:00.000Z',
    );
    expect(getDuesPeriodStart('WEEKLY', WEDNESDAY)?.toISOString()).toBe(
      '2026-11-09T05:00:00.000Z',
    );
    // 1 November 2026 is still daylight time in New York (UTC-4).
    expect(getDuesPeriodStart('MONTHLY', WEDNESDAY)?.toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(getDuesPeriodStart('NONE', WEDNESDAY)).toBeNull();
  });

  it('names the next collection', () => {
    expect(getNextDuesCollection('DAILY', WEDNESDAY)?.toISOString()).toBe(
      '2026-11-13T05:00:00.000Z',
    );
    expect(getNextDuesCollection('WEEKLY', WEDNESDAY)?.toISOString()).toBe(
      '2026-11-16T05:00:00.000Z',
    );
    expect(getNextDuesCollection('MONTHLY', WEDNESDAY)?.toISOString()).toBe(
      '2026-12-01T05:00:00.000Z',
    );
    // December rolls into January of the next year.
    expect(
      getNextDuesCollection(
        'MONTHLY',
        new Date('2026-12-20T15:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2027-01-01T05:00:00.000Z');
    expect(getNextDuesCollection('NONE', WEDNESDAY)).toBeNull();
  });

  it('a Monday belongs to its own week', () => {
    const monday = new Date('2026-11-16T12:00:00.000Z');
    expect(getDuesPeriodStart('WEEKLY', monday)?.toISOString()).toBe(
      '2026-11-16T05:00:00.000Z',
    );
  });

  it('reads serialized amounts', () => {
    expect(toDuesBigInt('1500n')).toBe(1500n);
    expect(toDuesBigInt(42)).toBe(42n);
    expect(toDuesBigInt('nope')).toBe(0n);
    expect(toDuesBigInt(null)).toBe(0n);
  });
});
