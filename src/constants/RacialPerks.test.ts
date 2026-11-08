import { describe, expect, it } from 'bun:test';

import {
  disciplineDesertion,
  disciplineMoraleFloor,
  hallowedBlocked,
  necropolisBonus,
  necropolisDailyCap,
  RACIAL_PERK_TIERS,
  racialFortRequirement,
  racialPerkTier,
  raidersCapacity,
  raidersCapturePercent,
  raidersRansomShare,
  sanctuaryDailyCap,
  sanctuaryRecovery,
} from '@/constants/RacialPerks';

describe('racial perk tuning', () => {
  it('provides all discipline, raiders and necropolis tiers including tier zero', () => {
    const tiers = [0, 1, 2, 3, 4];
    expect(tiers.map((tier) => disciplineDesertion(100, tier))).toEqual([
      100, 75, 60, 45, 30,
    ]);
    expect(tiers.map(disciplineMoraleFloor)).toEqual([0, 5, 10, 15, 20]);
    expect(tiers.map(raidersCapturePercent)).toEqual([
      0.1, 0.12, 0.14, 0.16, 0.18,
    ]);
    expect(tiers.map((tier) => raidersCapacity(200, tier))).toEqual([
      200, 250, 300, 350, 400,
    ]);
    expect(tiers.map((tier) => raidersRansomShare(100n, tier))).toEqual([
      50n,
      55n,
      60n,
      65n,
      70n,
    ]);
    expect(tiers.map(necropolisBonus)).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
    expect(tiers.map((tier) => necropolisDailyCap(10000, tier))).toEqual([
      200, 250, 300, 350, 400,
    ]);
    expect(
      [1, 2, 3, 4].map((tier) => racialFortRequirement('GOBLIN', tier)),
    ).toEqual([13, 15, 17, 19]);
  });
  it('exposes four ordered tiers with the specified costs and fort gates', () => {
    expect(
      RACIAL_PERK_TIERS.map((tier) => [tier.fortLevel, tier.cost]),
    ).toEqual([
      [5, 1_000_000],
      [9, 4_000_000],
      [13, 12_000_000],
      [17, 30_000_000],
    ]);
    expect(racialPerkTier(0)).toBeUndefined();
    expect(racialPerkTier(5)).toBeUndefined();
  });

  it('calculates blocked, recovered and capped units, flooring once', () => {
    expect([1, 2, 3, 4].map((tier) => hallowedBlocked(100, tier))).toEqual([
      20, 35, 50, 65,
    ]);
    expect([1, 2, 3, 4].map((tier) => sanctuaryRecovery(100, tier))).toEqual([
      5, 7, 9, 12,
    ]);
    expect([1, 2, 3, 4].map((tier) => sanctuaryDailyCap(1000, tier))).toEqual([
      20, 20, 25, 30,
    ]);
    expect(hallowedBlocked(9, 1)).toBe(1);
    expect(sanctuaryRecovery(-1, 4)).toBe(0);
    expect(sanctuaryDailyCap(1000, 0)).toBe(0);
  });
});
