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
    expect(bonus).toBeGreaterThanOrEqual(2);
  });
});
