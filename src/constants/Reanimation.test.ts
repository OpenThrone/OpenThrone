import { describe, expect, test } from 'bun:test';

import { FEATURE_REQUIREMENTS } from './FeatureUnlocks';
import {
  deadCombatRows,
  distributeReanimation,
  ENEMY_REANIMATION_PERCENT,
  ENEMY_REANIMATION_PERCENT_MAX,
  enemyReanimationPercent,
  enemyReanimationQuantity,
  isReanimatableUnitType,
  OWN_REANIMATION_PERCENT,
  OWN_REANIMATION_PERCENT_MAX,
  ownReanimationPercent,
  ownReanimationQuantity,
  REANIMATED_UNIT_LEVEL,
  REANIMATION_DAILY_CAP_PERCENT,
  REANIMATION_FORT_LEVEL,
  reanimationDailyCap,
} from './Reanimation';

describe('reanimation tuning constants', () => {
  test('the unlock level mirrors the REANIMATION feature requirement', () => {
    expect(REANIMATION_FORT_LEVEL).toBe(
      FEATURE_REQUIREMENTS.REANIMATION.fortLevel ?? -1,
    );
    expect(FEATURE_REQUIREMENTS.REANIMATION.race).toBe('UNDEAD');
  });

  test('risen units always come back at level 1', () => {
    expect(REANIMATED_UNIT_LEVEL).toBe(1);
  });

  test('only trained combat units can rise', () => {
    for (const type of ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']) {
      expect(isReanimatableUnitType(type)).toBe(true);
    }
    for (const type of ['CITIZEN', 'WORKER', 'offense', '']) {
      expect(isReanimatableUnitType(type)).toBe(false);
    }
  });
});

describe('fort-level scaling of the shares', () => {
  test('own dead: 8% at the unlock level, +0.5pp per level, capped at 15%', () => {
    expect(OWN_REANIMATION_PERCENT).toBe(0.08);
    expect(ownReanimationPercent(REANIMATION_FORT_LEVEL)).toBe(0.08);
    expect(ownReanimationPercent(REANIMATION_FORT_LEVEL + 2)).toBe(0.09);
    // 8% + 14 * 0.5pp = 15%: the cap first binds at fort 19.
    expect(ownReanimationPercent(19)).toBe(0.15);
    expect(ownReanimationPercent(40)).toBe(0.15);
    expect(OWN_REANIMATION_PERCENT_MAX).toBe(0.15);
    // Below the unlock level the feature is locked; the share still reads
    // its base value for display.
    expect(ownReanimationPercent(1)).toBe(0.08);
    expect(ownReanimationPercent(0)).toBe(0.08);
  });

  test('enemy dead: 4% at the unlock level, +0.5pp per level, capped at 8%', () => {
    expect(ENEMY_REANIMATION_PERCENT).toBe(0.04);
    expect(enemyReanimationPercent(REANIMATION_FORT_LEVEL)).toBe(0.04);
    expect(enemyReanimationPercent(REANIMATION_FORT_LEVEL + 6)).toBe(0.07);
    // 4% + 8 * 0.5pp = 8%: the cap first binds at fort 13.
    expect(enemyReanimationPercent(13)).toBe(0.08);
    expect(enemyReanimationPercent(40)).toBe(0.08);
    expect(ENEMY_REANIMATION_PERCENT_MAX).toBe(0.08);
  });
});

describe('reanimationQuantity', () => {
  test('floors once on the fallen total, never below zero', () => {
    expect(ownReanimationQuantity(1000, REANIMATION_FORT_LEVEL)).toBe(80);
    expect(ownReanimationQuantity(999, REANIMATION_FORT_LEVEL)).toBe(79);
    expect(ownReanimationQuantity(12, REANIMATION_FORT_LEVEL)).toBe(0);
    expect(enemyReanimationQuantity(1000, REANIMATION_FORT_LEVEL)).toBe(40);
    expect(enemyReanimationQuantity(249, REANIMATION_FORT_LEVEL)).toBe(9);
    expect(ownReanimationQuantity(-5, REANIMATION_FORT_LEVEL)).toBe(0);
    expect(ownReanimationQuantity(Number.NaN, REANIMATION_FORT_LEVEL)).toBe(0);
  });

  test('rounding on the total makes stack-splitting worthless', () => {
    // 999 fallen in one row: 79 rise. The same 999 split into 111 rows of 9
    // would floor to nothing per row — the total rounds once, so splitting
    // cannot dodge the share (and cannot farm extra risers either).
    expect(ownReanimationQuantity(999, REANIMATION_FORT_LEVEL)).toBe(79);
    const split = distributeReanimation(Array(111).fill(9), 79);
    expect(split.reduce((sum, value) => sum + value, 0)).toBe(79);
    expect(split.every((value) => value >= 0)).toBe(true);
  });
});

describe('reanimationDailyCap', () => {
  test('is 2% of the trained combat army, floored', () => {
    expect(REANIMATION_DAILY_CAP_PERCENT).toBe(0.02);
    expect(reanimationDailyCap(1000)).toBe(20);
    expect(reanimationDailyCap(999)).toBe(19);
    expect(reanimationDailyCap(49)).toBe(0);
    expect(reanimationDailyCap(0)).toBe(0);
    expect(reanimationDailyCap(-5)).toBe(0);
    expect(reanimationDailyCap(Number.NaN)).toBe(0);
  });
});

describe('deadCombatRows', () => {
  test('keeps only trained combat rows', () => {
    const rows = deadCombatRows(
      [
        { type: 'CITIZEN', level: 1, quantity: 500 },
        { type: 'WORKER', level: 1, quantity: 500 },
        { type: 'DEFENSE', level: 1, quantity: 500, isMercenary: true },
        { type: 'DEFENSE', level: 2, quantity: 300 },
        { type: 'OFFENSE', level: 3, quantity: 0 },
      ],
      0,
    );
    expect(rows).toEqual([{ type: 'DEFENSE', level: 2, quantity: 300 }]);
  });

  test('alliance and other temporary-force rows never rise, even without the mercenary flag', () => {
    const rows = deadCombatRows(
      [
        { type: 'OFFENSE', level: 1, quantity: 1000, forceKind: 'ALLIANCE' },
        { type: 'DEFENSE', level: 1, quantity: 800, forceKind: 'MERCENARY' },
        { type: 'DEFENSE', level: 2, quantity: 300 },
      ],
      0,
    );
    // Force rows belong to their sender, not to the player's own dead.
    expect(rows).toEqual([{ type: 'DEFENSE', level: 2, quantity: 300 }]);
  });

  test('force rows also stay out of the killed total the capture split works on', () => {
    // 10 captured split across only the 500 own fallen, never the 5000
    // alliance contingent: the dead rows lose exactly the capture.
    const rows = deadCombatRows(
      [
        { type: 'OFFENSE', level: 1, quantity: 5000, forceKind: 'ALLIANCE' },
        { type: 'DEFENSE', level: 1, quantity: 500 },
      ],
      50,
    );
    expect(rows).toEqual([{ type: 'DEFENSE', level: 1, quantity: 450 }]);
  });

  test('removes the captured exactly where the dungeon took them', () => {
    // 10% of 1000 killed = 100 captured, split 50/30/20 across 500/300/200;
    // the dead rows carry what is left.
    const rows = deadCombatRows(
      [
        { type: 'DEFENSE', level: 1, quantity: 500 },
        { type: 'DEFENSE', level: 2, quantity: 300 },
        { type: 'OFFENSE', level: 1, quantity: 200 },
      ],
      100,
    );
    expect(rows).toEqual([
      { type: 'DEFENSE', level: 1, quantity: 450 },
      { type: 'DEFENSE', level: 2, quantity: 270 },
      { type: 'OFFENSE', level: 1, quantity: 180 },
    ]);
    // Captured units are never dead: the totals drop by exactly the capture.
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(900);
  });

  test('clamps a captured total larger than the fallen', () => {
    const rows = deadCombatRows(
      [{ type: 'DEFENSE', level: 1, quantity: 10 }],
      999,
    );
    expect(rows).toEqual([]);
    expect(deadCombatRows([], 50)).toEqual([]);
  });
});
