import { describe, expect, it } from 'bun:test';

import { levelXPArray } from '@/constants';
import { gameDaysAtLevel, levelReachedAtUpdate } from '@/utils/levelReachedAt';
import { getGameDayMs } from '@/utils/timefunctions';

const xpFor = (level: number) =>
  levelXPArray.find((entry) => entry.level === level)!.xp;
const NOW = new Date('2026-10-31T12:00:00.000Z');

describe('levelReachedAtUpdate (#334)', () => {
  it('stamps the time when XP moves the level up', () => {
    expect(levelReachedAtUpdate(xpFor(2) - 1, xpFor(2), NOW)).toEqual({
      level_reached_at: NOW,
    });
    expect(levelReachedAtUpdate(0, xpFor(5), NOW)).toEqual({
      level_reached_at: NOW,
    });
  });

  it('stamps the time when XP drops the level', () => {
    expect(levelReachedAtUpdate(xpFor(3), xpFor(3) - 1, NOW)).toEqual({
      level_reached_at: NOW,
    });
  });

  it('leaves the column alone for a same-level gain', () => {
    expect(levelReachedAtUpdate(xpFor(4), xpFor(5) - 1, NOW)).toEqual({});
    expect(levelReachedAtUpdate(0, 0, NOW)).toEqual({});
  });
});

describe('gameDaysAtLevel (#334)', () => {
  it('reads a missing stamp as just reached', () => {
    expect(gameDaysAtLevel(null, NOW)).toBe(0);
    expect(gameDaysAtLevel(undefined, NOW)).toBe(0);
    expect(gameDaysAtLevel('not a date', NOW)).toBe(0);
  });

  it('counts game days, never negative', () => {
    const since = new Date(NOW.getTime() - 5 * getGameDayMs());
    expect(gameDaysAtLevel(since, NOW)).toBeCloseTo(5, 10);
    expect(gameDaysAtLevel(since.toISOString(), NOW)).toBeCloseTo(5, 10);
    expect(gameDaysAtLevel(new Date(NOW.getTime() + 1000), NOW)).toBe(0);
  });
});
