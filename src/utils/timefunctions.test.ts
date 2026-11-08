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

describe('game day length', () => {
  const withGameDay = async (minutes: string | undefined, run: () => void) => {
    const previous = process.env.GAME_DAY_MINUTES;
    const previousPublic = process.env.NEXT_PUBLIC_GAME_DAY_MINUTES;
    delete process.env.NEXT_PUBLIC_GAME_DAY_MINUTES;
    if (minutes === undefined) delete process.env.GAME_DAY_MINUTES;
    else process.env.GAME_DAY_MINUTES = minutes;
    try {
      run();
    } finally {
      if (previous === undefined) delete process.env.GAME_DAY_MINUTES;
      else process.env.GAME_DAY_MINUTES = previous;
      if (previousPublic !== undefined)
        process.env.NEXT_PUBLIC_GAME_DAY_MINUTES = previousPublic;
    }
  };

  it('matches the OT calendar day by default', async () => {
    const t = await import('./timefunctions');
    await withGameDay(undefined, () => {
      const at = new Date('2026-10-14T01:30:00Z');
      expect(t.getGameDayMs()).toBe(24 * 60 * 60 * 1000);
      expect(t.getGameDayKey(at)).toBe(t.getOTDayKey(at));
      expect(t.getGameDayStart(0, at)).toEqual(t.getOTStartDate(0, at));
      expect(t.getGameDayStart(2, at)).toEqual(t.getOTStartDate(2, at));
    });
  });

  it('splits the OT day into blocks aligned to OT midnight', async () => {
    const t = await import('./timefunctions');
    await withGameDay('240', () => {
      // 09:30 in New York (EDT) is in the 08:00-12:00 block, the third of the day.
      const at = new Date('2026-10-30T13:30:00Z');
      expect(t.getGameDayMs()).toBe(4 * 60 * 60 * 1000);
      expect(t.getGameDayKey(at)).toBe('2026-10-30#2');
      expect(t.getGameDayStart(0, at).toISOString()).toBe(
        '2026-10-30T12:00:00.000Z',
      );
      expect(t.getGameDayStart(1, at).toISOString()).toBe(
        '2026-10-30T16:00:00.000Z',
      );
      // Offsets roll across OT midnight.
      expect(t.getGameDayStart(-3, at).toISOString()).toBe(
        '2026-10-30T00:00:00.000Z',
      );
      expect(t.getGameDayKey(new Date('2026-10-31T03:59:00Z'))).toBe(
        '2026-10-30#5',
      );
    });
  });

  it('counts the deposit countdown down over the game day, not 24 hours', async () => {
    const t = await import('./timefunctions');
    const since = new Date('2026-10-30T16:24:36Z');
    const now = new Date('2026-10-30T16:25:36Z');
    await withGameDay('240', () => {
      expect(t.getGameDayWindowCountdown(since, now)).toEqual({
        hours: 3,
        minutes: 59,
        seconds: 0,
      });
      expect(
        t.getGameDayWindowCountdown(since, new Date('2026-10-30T20:24:36Z')),
      ).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    });
    await withGameDay(undefined, () => {
      expect(t.getGameDayWindowCountdown(since, now).hours).toBe(23);
    });
  });

  it('falls back to a real day for lengths that do not divide it', async () => {
    const t = await import('./timefunctions');
    for (const bad of ['0', '-60', '250', '90.5', 'abc']) {
      await withGameDay(bad, () => {
        expect(t.getGameDayMinutes()).toBe(24 * 60);
      });
    }
  });
});
