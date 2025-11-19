import { normUnits } from "test/utils/testFixtures";
import { describe, it, expect } from 'bun:test';
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
    const s = new UserStatsService({ bonus_points: normUnits([{ type: 'INCOME', level: 2 }]) });
    const bonus = s.getIncomeBonus();
    expect(bonus).toBeGreaterThanOrEqual(2);
  });
});
