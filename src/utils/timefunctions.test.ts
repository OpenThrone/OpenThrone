import { describe, expect, it, vi } from 'bun:test';

import { getTimeRemaining } from './timefunctions';

describe('getTimeRemaining', () => {
  it('should return the correct time remaining', () => {
    const endtime = '2022-12-31T23:59:59Z';
    const currentTime = new Date('2022-12-31T12:00:00Z');

    // Mock Date.now() to return the fixed currentTime
    const originalDateNow = Date.now;
    Date.now = vi.fn(() => currentTime.getTime());

    const expectedTimeRemaining = {
      total: Date.parse(endtime) - currentTime.getTime(),
      days: 0,
      hours: 11,
      minutes: 59,
      seconds: 59,
    };

    try {
      expect(getTimeRemaining(endtime)).toEqual(expectedTimeRemaining);
    } finally {
      // Restore original Date.now
      Date.now = originalDateNow;
    }
  });

  // Add more test cases for different endtime values and expected results
});

describe('OT time', () => {
  // 2026-03-08 is the US spring-forward day; 2026-11-01 falls back.
  it('keys the day by the OT calendar, not UTC', async () => {
    const { getOTDayKey, getOTStartDate, OT_TIME_ZONE } =
      await import('./timefunctions');
    expect(OT_TIME_ZONE).toBe('America/New_York');
    // 01:30 UTC on the 14th is still the 13th in New York.
    expect(getOTDayKey(new Date('2026-10-14T01:30:00Z'))).toBe('2026-10-13');
    expect(getOTDayKey(new Date('2026-10-14T04:00:00Z'))).toBe('2026-10-14');
    // Start of the OT day is 04:00Z in daylight time and 05:00Z in winter.
    expect(
      getOTStartDate(0, new Date('2026-10-14T01:30:00Z')).toISOString(),
    ).toBe('2026-10-13T04:00:00.000Z');
    expect(
      getOTStartDate(0, new Date('2026-01-15T12:00:00Z')).toISOString(),
    ).toBe('2026-01-15T05:00:00.000Z');
    // Offsets step whole OT days across the DST change.
    expect(
      getOTStartDate(1, new Date('2026-03-07T12:00:00Z')).toISOString(),
    ).toBe('2026-03-08T05:00:00.000Z');
    expect(
      getOTStartDate(2, new Date('2026-03-07T12:00:00Z')).toISOString(),
    ).toBe('2026-03-09T04:00:00.000Z');
  });

  it('formats the sidebar clock in OT time regardless of the host zone', async () => {
    const { formatOTTime } = await import('./timefunctions');
    expect(formatOTTime(new Date('2026-10-14T01:30:00Z'))).toBe('21:30');
    expect(formatOTTime(new Date('2026-01-15T12:00:00Z'))).toBe('07:00');
  });
});
