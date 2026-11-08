import { describe, expect, it } from 'bun:test';

import type { PlayerUnit } from '@/types/typings';

import { UserEconomyService } from '../UserEconomyService';

describe('UserEconomyService income breakdown', () => {
  it('fort income includes the income bonus, so the rows add up to the total', () => {
    // The playtest #328 kingdom: 37 workers, a Manor, a 5.14% income bonus.
    const economy = new UserEconomyService({
      units: [{ type: 'WORKER', level: 1, quantity: 37 } as PlayerUnit],
      economyLevel: 0,
      fortLevel: 1,
      incomeBonus: 5.14,
    });

    expect(economy.getFortificationGoldPerTurn()).toBeCloseTo(1051.4, 6);
    expect(
      Math.ceil(
        economy.getWorkerGoldPerTurn() + economy.getFortificationGoldPerTurn(),
      ),
    ).toBe(Number(economy.getGoldPerTurn()));
  });

  it('splits income into whole-gold base rows and a bonus row that sum to the total', () => {
    // FlashGuard in playtest #328: 25 workers, a Manor, Wealth at 0.14%.
    // The bonus-inclusive rows (1,251.743 + 1,001.394) rounded up to 2,254
    // and looked 0.86 short.
    for (const [workers, incomeBonus] of [
      [25, 0.14], // 1,250 + 1,000 + 4 = 2,254
      [37, 5.14],
      [27, 0],
    ] as const) {
      const economy = new UserEconomyService({
        units: [{ type: 'WORKER', level: 1, quantity: workers } as PlayerUnit],
        economyLevel: 0,
        fortLevel: 1,
        incomeBonus,
      });
      const income = economy.getIncomeBreakdown();
      expect(Number.isInteger(income.workerGold)).toBe(true);
      expect(Number.isInteger(income.fortGold)).toBe(true);
      expect(income.workerGold).toBe(income.goldPerWorker * workers);
      expect(income.workerGold + income.fortGold + income.bonusGold).toBe(
        income.total,
      );
      expect(income.total).toBe(Number(economy.getGoldPerTurn()));
      expect(income.bonusGold).toBeGreaterThanOrEqual(0);
      if (incomeBonus === 0) expect(income.bonusGold).toBe(0);
    }
  });
});
