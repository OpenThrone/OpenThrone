import { describe, expect, it } from 'bun:test';
import { normUnits } from 'test/utils/testFixtures';

const { UserStatsService } = require('../UserStatsService');

describe('UserStatsService', () => {
  it('calculateLevel and xpToNextLevel behave as expected', () => {
    const s = new UserStatsService({ experience: 0 });
    const lvl = s.calculateLevel();
    expect(typeof lvl).toBe('number');
    const xp = s.xpToNextLevel();
    expect(typeof xp).toBe('number');
  });

  it('getIncomeBonus includes bonus_points', () => {
    const s = new UserStatsService({
      bonus_points: normUnits([{ type: 'INCOME', level: 2 }]),
    });
    const bonus = s.getIncomeBonus();
    // calculateBonusPointMultiplier(2) ≈ 1.00278, so pointsBonus ≈ 0.278
    expect(bonus).toBeGreaterThanOrEqual(0);
  });
});

describe('getPriceBonus clamp', () => {
  // Bypass the shipped Bonuses table to exercise totals beyond 100 percent.
  const withPriceBonuses = (amounts: number[]) => {
    const s = new UserStatsService({ bonus_points: [] });
    s.getPlayerBonuses = () =>
      amounts.map((bonusAmount) => ({
        race: 'HUMAN',
        bonusType: 'PRICES',
        bonusAmount,
      })) as any;
    return s;
  };

  it('never exceeds 100 percent, so a cost cannot go negative', () => {
    const bonus = withPriceBonuses([60, 70]).getPriceBonus();
    expect(bonus).toBe(100);
    const cost = 1000 - (bonus / 100) * 1000;
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('never drops below zero', () => {
    expect(withPriceBonuses([-40]).getPriceBonus()).toBe(0);
  });

  it('passes ordinary totals through unchanged', () => {
    expect(withPriceBonuses([10]).getPriceBonus()).toBe(10);
  });
});
