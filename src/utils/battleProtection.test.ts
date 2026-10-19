import { describe, expect, it } from 'bun:test';

import { levelXPArray } from '@/constants/XPLevels';
import {
  getProtectionPopulationThreshold,
  getProtectionProgress,
  getProtectionStatus,
  normalizeProtectionDurationDays,
  PROTECTION_LEVEL_LIMIT,
  shouldForfeitProtection,
} from '@/utils/battleProtection';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T12:00:00.000Z');
const ERA = {
  id: 7,
  startDate: new Date(NOW.getTime() - 40 * DAY),
  startSettings: { citizens: 50 },
};
const SETTINGS = { durationDays: 14, recruitDailyCap: 0 };
const xpForLevel = (level: number) =>
  levelXPArray.find((entry) => entry.level === level)?.xp ?? 0;

const fresh = (overrides: Record<string, unknown> = {}) => ({
  experience: 0,
  population: 60,
  houseLevel: 1,
  eraJoinedAt: new Date(NOW.getTime() - 2 * DAY),
  createdAt: new Date(NOW.getTime() - 100 * DAY),
  protectionForfeitedEraId: null,
  ...overrides,
});

describe('getProtectionStatus', () => {
  it('raises the population limit by citizens received from timed events (#89)', () => {
    const base = getProtectionStatus(fresh(), ERA, SETTINGS, NOW);
    const over = base.populationThreshold + 50;
    expect(
      getProtectionStatus(fresh({ population: over }), ERA, SETTINGS, NOW)
        .protected,
    ).toBe(false);
    const status = getProtectionStatus(
      fresh({ population: over, eventCitizensReceived: 100 }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(status.protected).toBe(true);
    expect(status.populationThreshold).toBe(base.populationThreshold + 100);
  });

  it('protects a fresh player and reports the time limit', () => {
    const status = getProtectionStatus(fresh(), ERA, SETTINGS, NOW);
    expect(status.protected).toBe(true);
    expect(status.reason).toBe('ACTIVE');
    expect(status.levelLimit).toBe(10);
    expect(status.daysLeft).toBeCloseTo(12, 5);
    expect(status.endsAt?.getTime()).toBe(NOW.getTime() + 12 * DAY);
  });

  it('ends after the configured number of days', () => {
    const joined = new Date(NOW.getTime() - 14 * DAY);
    const status = getProtectionStatus(
      fresh({ eraJoinedAt: joined }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(status.protected).toBe(false);
    expect(status.reason).toBe('TIME');
    expect(status.daysLeft).toBe(0);
    const longer = getProtectionStatus(
      fresh({ eraJoinedAt: joined }),
      ERA,
      { ...SETTINGS, durationDays: 30 },
      NOW,
    );
    expect(longer.protected).toBe(true);
  });

  it('ends when population reaches the threshold', () => {
    // Housing level 1 grants 20/day; (20 + 5 bonus) * 14 + 50 starting citizens.
    const settings = { durationDays: 14, recruitDailyCap: 5 };
    const threshold = (20 + 5) * 14 + 50;
    expect(
      getProtectionStatus(
        fresh({ population: threshold - 1 }),
        ERA,
        settings,
        NOW,
      ).protected,
    ).toBe(true);
    const status = getProtectionStatus(
      fresh({ population: threshold }),
      ERA,
      settings,
      NOW,
    );
    expect(status.populationThreshold).toBe(threshold);
    expect(status.reason).toBe('POPULATION');
    expect(status.protected).toBe(false);
  });

  it('ends at level 10 and not before', () => {
    const at9 = getProtectionStatus(
      fresh({ experience: xpForLevel(9) }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(at9.level).toBe(9);
    expect(at9.protected).toBe(true);
    const at10 = getProtectionStatus(
      fresh({ experience: xpForLevel(PROTECTION_LEVEL_LIMIT) }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(at10.reason).toBe('LEVEL');
    expect(at10.protected).toBe(false);
  });

  it('ends when protection was forfeited in this era only', () => {
    const forfeited = getProtectionStatus(
      fresh({ protectionForfeitedEraId: ERA.id }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(forfeited.reason).toBe('FORFEITED');
    expect(forfeited.forfeited).toBe(true);
    expect(forfeited.protected).toBe(false);
    const earlierEra = getProtectionStatus(
      fresh({ protectionForfeitedEraId: ERA.id - 1 }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(earlierEra.protected).toBe(true);
  });

  it('falls back to max(era start, created_at) for legacy rows', () => {
    const recentSignup = getProtectionStatus(
      fresh({
        eraJoinedAt: null,
        createdAt: new Date(NOW.getTime() - 3 * DAY),
      }),
      ERA,
      SETTINGS,
      NOW,
    );
    expect(recentSignup.protected).toBe(true);
    expect(recentSignup.endsAt?.getTime()).toBe(NOW.getTime() + 11 * DAY);
    const oldAccount = getProtectionStatus(
      fresh({ eraJoinedAt: null }),
      ERA,
      SETTINGS,
      NOW,
    );
    // created 100 days ago, era started 40 days ago: era start wins and expired.
    expect(oldAccount.reason).toBe('TIME');
  });

  it('applies only level, forfeit and population rules when no era is known', () => {
    const status = getProtectionStatus(fresh(), null, SETTINGS, NOW);
    expect(status.endsAt).toBeNull();
    expect(status.protected).toBe(true);
  });
});

describe('population threshold and settings', () => {
  it('is (housing daily + admin bonus) * days, plus the starting baseline', () => {
    expect(
      getProtectionPopulationThreshold({
        houseLevel: 1,
        recruitDailyCap: 10,
        durationDays: 14,
        startingPopulation: 0,
      }),
    ).toBe((20 + 10) * 14);
    expect(
      getProtectionPopulationThreshold({
        houseLevel: 0,
        recruitDailyCap: 0,
        durationDays: 30,
        startingPopulation: 50,
      }),
    ).toBe(50 + 1 * 30);
  });

  it('clamps the duration to 1-60 days', () => {
    expect(normalizeProtectionDurationDays(0)).toBe(1);
    expect(normalizeProtectionDurationDays(500)).toBe(60);
    expect(normalizeProtectionDurationDays('x')).toBe(14);
    expect(normalizeProtectionDurationDays(21)).toBe(21);
  });
});

describe('shouldForfeitProtection', () => {
  it('forfeits only when a protected attacker hits an unprotected defender', () => {
    expect(shouldForfeitProtection(true, false)).toBe(true);
    expect(shouldForfeitProtection(true, true)).toBe(false);
    expect(shouldForfeitProtection(false, false)).toBe(false);
    expect(shouldForfeitProtection(false, true)).toBe(false);
  });
});

describe('getProtectionProgress', () => {
  const base = { level: 3, levelLimit: 10, timeRemainingShare: 0.5 };

  it('follows the limit that is furthest along', () => {
    // 668 of 914 population is further along than half the time window.
    const progress = getProtectionProgress({
      ...base,
      population: 668,
      populationThreshold: 914,
    });
    expect(progress.limit).toBe('POPULATION');
    expect(progress.share).toBeCloseTo(668 / 914, 5);
  });

  it('fills up as the time window runs out', () => {
    const progress = getProtectionProgress({
      ...base,
      timeRemainingShare: 1 / 14,
      population: 100,
      populationThreshold: 914,
    });
    expect(progress.limit).toBe('TIME');
    expect(progress.share).toBeCloseTo(13 / 14, 5);
  });

  it('clamps and tolerates a missing era', () => {
    expect(
      getProtectionProgress({
        level: 12,
        levelLimit: 10,
        timeRemainingShare: null,
        population: 0,
        populationThreshold: 0,
      }),
    ).toEqual({ share: 1, limit: 'LEVEL' });
  });
});
