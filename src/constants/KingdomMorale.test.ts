import { describe, expect, test } from 'bun:test';

import {
  applyMoraleDelta,
  armyDesertionAllowance,
  armyDesertionGuaranteedRemaining,
  armyDesertionQuantity,
  assessDefectorFarming,
  citizensDesertionQuantity,
  clampMorale,
  computeDailyMoraleDelta,
  DEFECTOR_FARMING_MIN_DAYS,
  DEFECTOR_FARMING_MIN_SHARE,
  defectorFarmingSeverity,
  defectorRecipientDailyCap,
  defenderFatigueMultiplier,
  defenderFatiguePercent,
  distributeDesertion,
  inactiveMoraleDecay,
  mercenaryDesertionQuantity,
  repelledPressureRecovery,
  splitDefectors,
} from './KingdomMorale';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-27T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

describe('clampMorale / applyMoraleDelta', () => {
  test('clamps into 0-100 and floors fractional input', () => {
    expect(clampMorale(150)).toBe(100);
    expect(clampMorale(-5)).toBe(0);
    expect(clampMorale(55.9)).toBe(55);
    expect(clampMorale(Number.NaN)).toBe(100);
  });

  test('applies deltas with clamping at both ends', () => {
    expect(applyMoraleDelta(99, 2)).toBe(100);
    expect(applyMoraleDelta(2, -3)).toBe(0);
    expect(applyMoraleDelta(50, -3)).toBe(47);
  });
});

describe('computeDailyMoraleDelta', () => {
  test('active within 24h earns the active bonus', () => {
    expect(computeDailyMoraleDelta({ lastActiveAt: ago(1), now })).toEqual({
      delta: 5,
      rule: 'ACTIVE',
    });
  });

  test('away 24-48h recovers passively', () => {
    expect(computeDailyMoraleDelta({ lastActiveAt: ago(30), now })).toEqual({
      delta: 3,
      rule: 'PASSIVE',
    });
  });

  test('away past 48h decays -5 per day', () => {
    expect(computeDailyMoraleDelta({ lastActiveAt: ago(72), now })).toEqual({
      delta: -5,
      rule: 'INACTIVE',
    });
  });

  test('long absence escalates weekly but is capped at -15', () => {
    expect(inactiveMoraleDecay(7)).toBe(-10);
    expect(inactiveMoraleDecay(14)).toBe(-15);
    expect(inactiveMoraleDecay(365)).toBe(-15);
    expect(
      computeDailyMoraleDelta({ lastActiveAt: ago(24 * 30), now }).delta,
    ).toBe(-15);
  });

  test('never-active players take the capped decay', () => {
    expect(computeDailyMoraleDelta({ lastActiveAt: null, now })).toEqual({
      delta: -15,
      rule: 'INACTIVE',
    });
  });
});

describe('desertion amounts', () => {
  test('citizens leave 1%/day in whole units and never below 100', () => {
    expect(citizensDesertionQuantity(99)).toBe(0);
    expect(citizensDesertionQuantity(100)).toBe(1);
    expect(citizensDesertionQuantity(257)).toBe(2);
  });

  test('the whole trained army deserts 1%/day in whole units, never per row', () => {
    expect(armyDesertionQuantity(550)).toBe(5);
    expect(armyDesertionQuantity(1188)).toBe(11);
    // 1% of a 100+ army is always at least one deserter, so no stack layout
    // can floor its way out of desertion.
    expect(armyDesertionQuantity(100)).toBe(1);
    expect(armyDesertionQuantity(99)).toBe(0);
    expect(armyDesertionQuantity(0)).toBe(0);
  });

  test('desertion is distributed across rows proportionally (largest remainder)', () => {
    // Twelve stacks of 99 (1188 units) lose 11: one unit from each of the
    // eleven rows with the largest (here equal) remainders.
    const spread = distributeDesertion(Array(12).fill(99), 11);
    expect(spread.reduce((sum, value) => sum + value, 0)).toBe(11);
    expect(spread.filter((value) => value === 1)).toHaveLength(11);
    expect(spread.filter((value) => value === 0)).toHaveLength(1);

    // Even rows split evenly; uneven rows pay their exact share.
    expect(distributeDesertion([5000, 5000], 100)).toEqual([50, 50]);
    expect(distributeDesertion([1000, 100], 11)).toEqual([10, 1]);
    expect(distributeDesertion([1000, 100], 7)).toEqual([6, 1]);

    // Never below zero, never past a row's size, never past the pool.
    expect(distributeDesertion([5], 99)).toEqual([5]);
    expect(distributeDesertion([3, 3], 4)).toEqual([2, 2]);
    expect(distributeDesertion([1, 1, 1], 0)).toEqual([0, 0, 0]);
    expect(distributeDesertion([], 10)).toEqual([]);
    expect(distributeDesertion([0, 10], 5)).toEqual([0, 5]);
  });

  test('the 75% floor bounds how much of the army may leave', () => {
    expect(armyDesertionGuaranteedRemaining(1000)).toBe(750);
    expect(armyDesertionAllowance(1000, 1000)).toBe(250);
    expect(armyDesertionAllowance(760, 1000)).toBe(10);
    expect(armyDesertionAllowance(750, 1000)).toBe(0);
    expect(armyDesertionAllowance(600, 1000)).toBe(0);
  });

  test('mercenaries lose 10% of the whole surviving pool per day', () => {
    expect(mercenaryDesertionQuantity(37)).toBe(3);
    expect(mercenaryDesertionQuantity(40)).toBe(4);
    // 10+ survivors always lose at least one; fewer never desert.
    expect(mercenaryDesertionQuantity(10)).toBe(1);
    expect(mercenaryDesertionQuantity(9)).toBe(0);
    expect(mercenaryDesertionQuantity(0)).toBe(0);
  });

  test('deserters split evenly between defecting and abandoning', () => {
    expect(splitDefectors(10)).toEqual({ defect: 5, abandon: 5 });
    expect(splitDefectors(7)).toEqual({ defect: 3, abandon: 4 });
    expect(splitDefectors(1)).toEqual({ defect: 0, abandon: 1 });
  });

  test('a recipient may gain at most 1% of their own army per day', () => {
    expect(defectorRecipientDailyCap(1234)).toBe(12);
    expect(defectorRecipientDailyCap(50)).toBe(0);
  });
});

describe('defector farming thresholds (#205)', () => {
  test('a pair signals at 3 distinct days but not at 2 (share below half)', () => {
    // 20 defectors against 150 lost (citizens, abandoners, defectors): a
    // normal collapsed kingdom's dilution keeps the share well under half.
    const diluted = {
      defectedToReceiver: 20,
      totalLostToDesertion: 150,
    };
    expect(
      assessDefectorFarming({ distinctDays: 2, ...diluted }),
    ).toMatchObject({ triggered: false, reasons: [], share: 20 / 150 });
    const atThree = assessDefectorFarming({
      distinctDays: DEFECTOR_FARMING_MIN_DAYS,
      ...diluted,
    });
    expect(atThree.triggered).toBe(true);
    expect(atThree.reasons).toEqual(['DAYS']);
    expect(atThree.score).toBe(1);
    expect(atThree.severity).toBe('LOW');
  });

  test('a stripped loser signals on share alone, even on a single day', () => {
    // No citizen or mercenary bleed: the receiver took exactly half of
    // everything the loser lost, hitting the share threshold on day one.
    const half = assessDefectorFarming({
      distinctDays: 1,
      defectedToReceiver: 50,
      totalLostToDesertion: 100,
    });
    expect(half.triggered).toBe(true);
    expect(half.reasons).toEqual(['SHARE']);
    expect(half.share).toBe(DEFECTOR_FARMING_MIN_SHARE);
    expect(half.score).toBe(1);
    // A hair under half does not signal.
    expect(
      assessDefectorFarming({
        distinctDays: 1,
        defectedToReceiver: 49,
        totalLostToDesertion: 100,
      }).triggered,
    ).toBe(false);
  });

  test('the share is defectors to the receiver over ALL desertion losses', () => {
    // 100 defectors to this receiver, 100 more lost to citizens, abandoning
    // soldiers and mercenaries: exactly one third, no signal without days.
    const third = assessDefectorFarming({
      distinctDays: 2,
      defectedToReceiver: 100,
      totalLostToDesertion: 300,
    });
    expect(third.share).toBeCloseTo(1 / 3, 10);
    expect(third.triggered).toBe(false);
  });

  test('score rises with extra days, dominant share and a shared login pattern', () => {
    const threeDays = assessDefectorFarming({
      distinctDays: 3,
      defectedToReceiver: 50,
      totalLostToDesertion: 100,
    });
    // 3 days + a half share.
    expect(threeDays.score).toBe(2);
    // Each day past the minimum adds one more.
    expect(
      assessDefectorFarming({
        distinctDays: 5,
        defectedToReceiver: 50,
        totalLostToDesertion: 100,
      }).score,
    ).toBe(4);
    // A dominant (>= 75%) share weighs double the plain half share.
    expect(
      assessDefectorFarming({
        distinctDays: 1,
        defectedToReceiver: 80,
        totalLostToDesertion: 100,
      }).score,
    ).toBe(2);
    // A shared login pattern adds weight to a triggered pair...
    expect(
      assessDefectorFarming({
        distinctDays: 3,
        defectedToReceiver: 20,
        totalLostToDesertion: 150,
        sharedLoginPattern: true,
      }).score,
    ).toBe(3);
    // ...but never triggers a pair on its own.
    expect(
      assessDefectorFarming({
        distinctDays: 1,
        defectedToReceiver: 10,
        totalLostToDesertion: 150,
        sharedLoginPattern: true,
      }).triggered,
    ).toBe(false);
  });

  test('severity climbs with the score', () => {
    expect(defectorFarmingSeverity(0)).toBe('LOW');
    expect(defectorFarmingSeverity(2)).toBe('LOW');
    expect(defectorFarmingSeverity(3)).toBe('MEDIUM');
    expect(defectorFarmingSeverity(4)).toBe('MEDIUM');
    expect(defectorFarmingSeverity(5)).toBe('HIGH');
    expect(defectorFarmingSeverity(6)).toBe('HIGH');
    expect(defectorFarmingSeverity(7)).toBe('CRITICAL');
    expect(defectorFarmingSeverity(12)).toBe('CRITICAL');
    // A blatant farm: 6 distinct days, 80% share, shared login pattern.
    expect(
      assessDefectorFarming({
        distinctDays: 6,
        defectedToReceiver: 80,
        totalLostToDesertion: 100,
        sharedLoginPattern: true,
      }),
    ).toMatchObject({ score: 8, severity: 'CRITICAL' });
  });

  test('degenerate inputs never signal', () => {
    expect(
      assessDefectorFarming({
        distinctDays: 0,
        defectedToReceiver: 0,
        totalLostToDesertion: 0,
      }),
    ).toMatchObject({ triggered: false, share: 0, score: 0 });
    expect(
      assessDefectorFarming({
        distinctDays: Number.NaN,
        defectedToReceiver: Number.NaN,
        totalLostToDesertion: Number.NaN,
      }).triggered,
    ).toBe(false);
    // Nothing received on many counted days (impossible with real events)
    // still cannot signal via share.
    expect(
      assessDefectorFarming({
        distinctDays: 5,
        defectedToReceiver: 0,
        totalLostToDesertion: 100,
      }).triggered,
    ).toBe(false);
  });
});

describe('defender fatigue (#204)', () => {
  test('multiplier is max(0.85, 1 - 0.0025 * pressure)', () => {
    expect(defenderFatigueMultiplier(0)).toBe(1);
    expect(defenderFatigueMultiplier(10)).toBeCloseTo(0.975, 10);
    expect(defenderFatigueMultiplier(60)).toBeCloseTo(0.85, 10);
    expect(defenderFatigueMultiplier(400)).toBe(0.85);
    expect(defenderFatigueMultiplier(-3)).toBe(1);
  });

  test('percent form rounds for report display', () => {
    expect(defenderFatiguePercent(0)).toBe(0);
    expect(defenderFatiguePercent(10)).toBe(3);
    expect(defenderFatiguePercent(60)).toBe(15);
    expect(defenderFatiguePercent(1000)).toBe(15);
  });

  test('a repelled attack nets +ceil(turns/2) pressure and never lowers pressure', () => {
    expect(repelledPressureRecovery(10, 5)).toBe(13);
    expect(repelledPressureRecovery(3, 4)).toBe(5);
    expect(repelledPressureRecovery(1, 5)).toBe(4);
    expect(repelledPressureRecovery(0, 10)).toBe(5);
    // Even turns net exactly half; odd turns net the rounded-up half.
    expect(repelledPressureRecovery(60, 4)).toBe(62);
    expect(repelledPressureRecovery(60, 5)).toBe(63);
  });
});
