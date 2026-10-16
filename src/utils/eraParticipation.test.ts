import { describe, expect, it } from 'bun:test';

import {
  hasParticipatedInEra,
  tookPartInArchivedEra,
} from './eraParticipation';

describe('current-era attack eligibility', () => {
  const start = new Date('2026-10-03T12:00:00Z');
  it('protects absent and previous-era players', () => {
    expect(hasParticipatedInEra(null, start)).toBe(false);
    expect(hasParticipatedInEra('2026-10-03T11:59:59Z', start)).toBe(false);
    expect(hasParticipatedInEra('invalid', start)).toBe(false);
    expect(hasParticipatedInEra(start, null)).toBe(false);
  });
  it('allows returning players at and after the era boundary', () => {
    expect(hasParticipatedInEra(start, start)).toBe(true);
    expect(hasParticipatedInEra('2026-10-03T12:01:00Z', start)).toBe(true);
  });
});

describe('archived era participation', () => {
  it('treats an untouched level-1 record as not taking part', () => {
    expect(
      tookPartInArchivedEra({
        maxLevelReached: 1,
        totalAttacksWon: 0,
        totalDefendsWon: 0,
      }),
    ).toBe(false);
    // Defends are won passively, so they do not prove the player played.
    expect(
      tookPartInArchivedEra({
        maxLevelReached: 1,
        totalAttacksWon: 0,
        totalDefendsWon: 3,
      }),
    ).toBe(false);
    expect(tookPartInArchivedEra({})).toBe(false);
    expect(tookPartInArchivedEra(null)).toBe(false);
  });
  it('counts levelling up or winning an attack as taking part', () => {
    expect(
      tookPartInArchivedEra({ maxLevelReached: 2, totalAttacksWon: 0 }),
    ).toBe(true);
    expect(
      tookPartInArchivedEra({ maxLevelReached: 1, totalAttacksWon: 1 }),
    ).toBe(true);
  });
});
