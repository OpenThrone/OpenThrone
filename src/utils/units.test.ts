import { describe, expect, it } from 'bun:test';

import { calculateTotalCost, getDiscountedUnitPrice } from '@/utils/units';

// Charisma discount for 3 and 4 bonus points (0.35 * n / (n + 250) * 100 %).
const pricesBonus = (points: number) => 0.35 * (points / (points + 250)) * 100;

describe('calculateTotalCost (#347)', () => {
  it('charges the per-unit price the Training card shows', () => {
    const uModel = { priceBonus: pricesBonus(4) } as any;
    expect(getDiscountedUnitPrice(2000, uModel.priceBonus)).toBe(1988);
    expect(
      calculateTotalCost(
        [{ type: 'WORKER', level: 1, quantity: 12 } as any],
        uModel,
      ),
    ).toBe(12 * 1988);
  });

  it('does not charge the fractional discount on top of the card price', () => {
    const uModel = { priceBonus: pricesBonus(3) } as any;
    expect(
      calculateTotalCost(
        [{ type: 'WORKER', level: 1, quantity: 13 } as any],
        uModel,
      ),
    ).toBe(13 * getDiscountedUnitPrice(2000, uModel.priceBonus));
  });
});
