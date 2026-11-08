/**
 * combat-v11 battle XP fairness (#334): lost attacks pay by effort, defenders
 * by threat with a floor, and campers earn more defender XP the longer they
 * hold one level. Older rulesets must keep paying exactly what they paid.
 */
import { describe, expect, it } from 'bun:test';

import {
  calculateBattleEffort,
  calculateBattleExperience,
  calculateLevelStallMultiplier,
} from '@/utils/attackFunctions';
import { COMBAT_RULESETS } from '@/utils/balance/combatRulesets';

const V9 = COMBAT_RULESETS['combat-v9']!;
const V10 = COMBAT_RULESETS['combat-v10']!;
const V11 = COMBAT_RULESETS['combat-v11']!;

type XpCase = [boolean, number, number, boolean, number, number, number];

/** A full 10-turn battle between equal levels at full morale. */
const xp = (
  ruleset: typeof V11,
  won: boolean,
  ratio: number,
  daysAtLevel = 0,
) =>
  calculateBattleExperience(
    won,
    0,
    10,
    false,
    ratio,
    100,
    20,
    ruleset,
    daysAtLevel,
  );

// The issue's case: 11 offense into 422 defense, lost.
const HOPELESS = 11 / 422;

describe('combat-v11 battle XP', () => {
  it('is the current ruleset and differs from v10 only in battleXp', () => {
    const { battleXp, version, ...rest } = V11;
    const { version: _v10, ...v10 } = V10;
    expect(version).toBe('combat-v11');
    expect(battleXp).toEqual({
      effortFloorRatio: 0.25,
      effortFullRatio: 0.75,
      defenderThreatFloor: 0.15,
      stallGraceDays: 3,
      stallPerDay: 0.25,
      stallMaxMultiplier: 3,
    });
    expect(JSON.stringify(rest)).toBe(JSON.stringify(v10));
  });

  it('scales effort from 0 at a quarter of the defense to 1 at three quarters', () => {
    expect(calculateBattleEffort(0, V11)).toBe(0);
    expect(calculateBattleEffort(HOPELESS, V11)).toBe(0);
    expect(calculateBattleEffort(0.25, V11)).toBe(0);
    expect(calculateBattleEffort(0.5, V11)).toBeCloseTo(0.5, 10);
    expect(calculateBattleEffort(0.75, V11)).toBe(1);
    expect(calculateBattleEffort(4, V11)).toBe(1);
    expect(calculateBattleEffort(Number.NaN, V11)).toBe(0);
  });

  it('pays a hopeless losing attacker nothing', () => {
    expect(xp(V10, false, HOPELESS).attackerXP).toBeGreaterThan(0);
    expect(xp(V11, false, HOPELESS).attackerXP).toBe(0);
  });

  it('pays a close loss exactly what v10 paid', () => {
    for (const ratio of [0.75, 0.95, 1, 1.2]) {
      expect(xp(V11, false, ratio)).toEqual(xp(V10, false, ratio));
    }
  });

  it('pays a half-effort loss half the v10 attacker XP', () => {
    const v10 = xp(V10, false, 0.5).attackerXP;
    expect(Math.abs(xp(V11, false, 0.5).attackerXP - v10 * 0.5)).toBeLessThan(
      1,
    );
  });

  it('pays the defender of a hopeless poke 15% of the v10 XP', () => {
    const v10 = xp(V10, false, HOPELESS).defenderXP;
    const v11 = xp(V11, false, HOPELESS).defenderXP;
    expect(Math.abs(v11 - v10 * 0.15)).toBeLessThan(1);
  });

  it('leaves wins unchanged for both sides', () => {
    for (const ratio of [0.8, 1, 2.5]) {
      expect(xp(V11, true, ratio)).toEqual(xp(V10, true, ratio));
    }
  });

  it.each([
    [0, 1],
    [2.9, 1],
    [3, 1],
    [3.99, 1],
    [4, 1.25],
    [5, 1.5],
    [10, 2.75],
    [11, 3],
    [40, 3],
  ])('ramps defender XP after %p game days at a level to x%p', (days, mult) => {
    expect(calculateLevelStallMultiplier(days, V11)).toBeCloseTo(mult, 10);
  });

  it('applies the ramp to defender XP only', () => {
    const fresh = xp(V11, false, 1, 0);
    const camped = xp(V11, false, 1, 5);
    expect(camped.attackerXP).toBe(fresh.attackerXP);
    expect(Math.abs(camped.defenderXP - fresh.defenderXP * 1.5)).toBeLessThan(
      1,
    );
    const capped = xp(V11, true, 2, 30);
    expect(
      Math.abs(capped.defenderXP - xp(V11, true, 2, 0).defenderXP * 3),
    ).toBeLessThan(1);
  });
});

describe('older rulesets keep their battle XP', () => {
  // Pinned from the engine before combat-v11 existed (same inputs, same XP).
  const CASES: XpCase[] = [
    [false, 0, 10, false, HOPELESS, 100, 20],
    [false, 3, 10, false, 0.95, 100, 20],
    [false, -2, 6, false, 0.5, 80, 40],
    [true, 0, 10, true, 1.3, 100, 30],
    [true, 5, 4, false, 2.5, 60, 60],
    [false, 0, 1, false, 0.1, 100, 1],
  ];
  const PINNED = [
    { attackerXP: 371, defenderXP: 1266 },
    { attackerXP: 724, defenderXP: 2469 },
    { attackerXP: 102, defenderXP: 347 },
    { attackerXP: 2038, defenderXP: 509 },
    { attackerXP: 279, defenderXP: 70 },
    { attackerXP: 19, defenderXP: 65 },
  ];

  it.each([
    ['combat-v9', V9],
    ['combat-v10', V10],
  ])('%s pays what it always paid, however long the defender camps', (_, r) => {
    for (const days of [0, 5, 30]) {
      expect(
        CASES.map((c) => calculateBattleExperience(...c, r, days)),
      ).toEqual(PINNED);
    }
    expect(calculateBattleEffort(HOPELESS, r)).toBe(1);
    expect(calculateLevelStallMultiplier(30, r)).toBe(1);
  });
});
