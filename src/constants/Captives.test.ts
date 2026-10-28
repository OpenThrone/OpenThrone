import { describe, expect, test } from 'bun:test';

import {
  CAPTIVE_MAX_DAYS,
  captorRansomShare,
  capturableCombatRows,
  CAPTURE_PERCENT,
  captureQuantity,
  CONVERT_MIN_HOURS,
  convertCostPerUnit,
  convertReadyAt,
  demotedUnitLevel,
  distributeCaptures,
  DUNGEON_BASE_CAPACITY,
  DUNGEON_CAPACITY_PER_LEVEL,
  DUNGEON_FORT_LEVEL,
  dungeonCapacity,
  escapesAt,
  isCapturableUnitType,
  RANSOM_CAPTOR_SHARE,
  ransomPricePerUnit,
} from './Captives';
import { FEATURE_REQUIREMENTS } from './FeatureUnlocks';
import { UnitTypes } from './Units';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-27T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

describe('dungeon tuning constants', () => {
  test('the unlock level mirrors the DUNGEON feature requirement', () => {
    expect(DUNGEON_FORT_LEVEL).toBe(
      FEATURE_REQUIREMENTS.DUNGEON.fortLevel ?? -1,
    );
  });

  test('capacity is 200 at the unlock level and +50 per level above', () => {
    expect(dungeonCapacity(DUNGEON_FORT_LEVEL)).toBe(DUNGEON_BASE_CAPACITY);
    expect(dungeonCapacity(DUNGEON_FORT_LEVEL + 1)).toBe(
      DUNGEON_BASE_CAPACITY + DUNGEON_CAPACITY_PER_LEVEL,
    );
    expect(dungeonCapacity(DUNGEON_FORT_LEVEL + 4)).toBe(
      DUNGEON_BASE_CAPACITY + 4 * DUNGEON_CAPACITY_PER_LEVEL,
    );
    // Below the unlock level the base capacity still applies (the dungeon is
    // locked anyway; the number only matters for display).
    expect(dungeonCapacity(1)).toBe(DUNGEON_BASE_CAPACITY);
    expect(dungeonCapacity(0)).toBe(DUNGEON_BASE_CAPACITY);
  });
});

describe('captureQuantity', () => {
  test('takes 10% of the battle total, floored once', () => {
    expect(CAPTURE_PERCENT).toBe(0.1);
    expect(captureQuantity(1000)).toBe(100);
    expect(captureQuantity(999)).toBe(99);
    expect(captureQuantity(9)).toBe(0);
    expect(captureQuantity(0)).toBe(0);
  });

  test('never goes negative on junk input', () => {
    expect(captureQuantity(-5)).toBe(0);
    expect(captureQuantity(Number.NaN)).toBe(0);
  });
});

describe('distributeCaptures', () => {
  test('splits proportionally with largest remainders, never over-taking a row', () => {
    // 10% of 1000 killed = 100 captives across rows of 500/300/200.
    const take = captureQuantity(1000);
    expect(take).toBe(100);
    expect(distributeCaptures([500, 300, 200], take)).toEqual([50, 30, 20]);
  });

  test('rounding on the battle total makes stack-splitting worthless', () => {
    // 99 killed in one row: 9 captured. The same 99 split into 11 rows of 9
    // would capture nothing per row — the total rounds once, so splitting
    // cannot dodge it.
    expect(captureQuantity(99)).toBe(9);
    expect(distributeCaptures([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9], 9)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0,
    ]);
  });

  test('never takes more than the rows hold', () => {
    expect(distributeCaptures([3, 2], 100)).toEqual([3, 2]);
    expect(distributeCaptures([], 10)).toEqual([]);
  });
});

describe('capturable unit types', () => {
  test('combat units only: citizens and workers are never captured', () => {
    expect(isCapturableUnitType('OFFENSE')).toBe(true);
    expect(isCapturableUnitType('DEFENSE')).toBe(true);
    expect(isCapturableUnitType('SPY')).toBe(true);
    expect(isCapturableUnitType('SENTRY')).toBe(true);
    expect(isCapturableUnitType('CITIZEN')).toBe(false);
    expect(isCapturableUnitType('WORKER')).toBe(false);
  });
});

describe('capturableCombatRows', () => {
  test('keeps only the trained combat rows of the source army', () => {
    const rows = capturableCombatRows([
      { type: 'CITIZEN', level: 1, quantity: 500 },
      { type: 'WORKER', level: 1, quantity: 500 },
      { type: 'DEFENSE', level: 1, quantity: 500, isMercenary: true },
      { type: 'DEFENSE', level: 2, quantity: 300 },
      { type: 'OFFENSE', level: 3, quantity: 0 },
    ]);
    expect(rows).toEqual([{ type: 'DEFENSE', level: 2, quantity: 300 }]);
  });

  test('alliance and other temporary-force rows are never captured, even without the mercenary flag', () => {
    // A force row recorded without isMercenary still belongs to its sender:
    // the dungeon can never take it (and it must not inflate the killed
    // total the capture share is rounded on either).
    const rows = capturableCombatRows([
      { type: 'DEFENSE', level: 1, quantity: 4000, forceKind: 'ALLIANCE' },
      { type: 'OFFENSE', level: 1, quantity: 800, forceKind: 'MERCENARY' },
      { type: 'DEFENSE', level: 2, quantity: 500 },
    ]);
    expect(rows).toEqual([{ type: 'DEFENSE', level: 2, quantity: 500 }]);
    // 10% is rounded on the capturable total only (500, not 5300).
    expect(
      captureQuantity(rows.reduce((sum, row) => sum + row.quantity, 0)),
    ).toBe(50);
  });
});

describe('ransom and conversion pricing', () => {
  const unit = (type: string, level: number) =>
    UnitTypes.find((u) => u.type === type && u.level === level);

  test('ransom is 40% and conversion 25% of the base cost, rounded up', () => {
    // Level 2 OFFENSE (Knight) costs 10,000.
    expect(unit('OFFENSE', 2)?.cost).toBe(10_000);
    expect(ransomPricePerUnit('OFFENSE', 2)).toBe(4_000n);
    expect(convertCostPerUnit('OFFENSE', 2)).toBe(2_500n);
    expect(ransomPricePerUnit('DEFENSE', 1)).toBe(600n);
  });

  test('unknown tiers price at zero rather than throwing', () => {
    expect(ransomPricePerUnit('OFFENSE', 99)).toBe(0n);
    expect(convertCostPerUnit('CITIZEN', 1)).toBe(0n);
  });

  test('the captor keeps half the ransom; the rest is burned', () => {
    expect(RANSOM_CAPTOR_SHARE).toBe(0.5);
    expect(captorRansomShare(4_000n)).toBe(2_000n);
    expect(captorRansomShare(601n)).toBe(300n);
    expect(captorRansomShare(0n)).toBe(0n);
  });
});

describe('convert and escape deadlines', () => {
  test('conversion opens after 72 hours in the dungeon', () => {
    expect(CONVERT_MIN_HOURS).toBe(72);
    expect(convertReadyAt(ago(72)).getTime()).toBe(now.getTime());
    expect(convertReadyAt(ago(71)).getTime()).toBeGreaterThan(now.getTime());
  });

  test('captives escape after 7 whole days', () => {
    expect(CAPTIVE_MAX_DAYS).toBe(7);
    expect(escapesAt(ago(7 * 24)).getTime()).toBe(now.getTime());
    expect(escapesAt(now).getTime()).toBe(
      now.getTime() + CAPTIVE_MAX_DAYS * 24 * HOUR,
    );
  });
});

describe('demotedUnitLevel', () => {
  test('keeps the tier when the fort unlocks it', () => {
    expect(demotedUnitLevel('OFFENSE', 3, 7)).toBe(3); // Berserker needs fort 7
    expect(demotedUnitLevel('DEFENSE', 2, 4)).toBe(2); // Archer needs fort 4
  });

  test('drops to the highest tier the fort unlocks', () => {
    // A Royal Guard (DEFENSE 3, fort 7) captured by a fort 4 player: Archer.
    expect(demotedUnitLevel('DEFENSE', 3, 4)).toBe(2);
    expect(demotedUnitLevel('DEFENSE', 3, 2)).toBe(1);
    expect(demotedUnitLevel('SPY', 3, 8)).toBe(2); // Assassin needs fort 12
  });

  test('level 1 is always available and junk input falls back to it', () => {
    expect(demotedUnitLevel('SENTRY', 3, 1)).toBe(1);
    expect(demotedUnitLevel('OFFENSE', 1, 1)).toBe(1);
    expect(demotedUnitLevel('UNICORN', 3, 1)).toBe(1);
    expect(demotedUnitLevel('OFFENSE', Number.NaN, 3)).toBe(1);
  });
});
