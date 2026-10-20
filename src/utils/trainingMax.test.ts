import { describe, expect, it } from 'bun:test';

import { getMaxTrainableQuantity } from '@/utils/trainingMax';

const base = {
  citizens: 94,
  citizensQueuedElsewhere: 0,
  gold: 10_000_000n,
  goldQueuedElsewhere: 0,
  unitCost: 1_500,
};

describe('getMaxTrainableQuantity (#88)', () => {
  it('fills with the citizens left after everything queued on the page', () => {
    // 50 Workers + 23 Soldiers queued: MAX on Guard gives the 21 left.
    expect(
      getMaxTrainableQuantity({ ...base, citizensQueuedElsewhere: 73 }),
    ).toBe(21);
    // MAX on Worker (its own 50 excluded) gives 50 + 21 = 71.
    expect(
      getMaxTrainableQuantity({
        ...base,
        unitCost: 2_000,
        citizensQueuedElsewhere: 23,
      }),
    ).toBe(71);
  });

  it('leaves room for gold queued in other sections', () => {
    // 100,000 gold, 50 Workers queued (100,000): nothing left for Guards.
    expect(
      getMaxTrainableQuantity({
        ...base,
        gold: 100_000n,
        citizensQueuedElsewhere: 50,
        goldQueuedElsewhere: 100_000,
      }),
    ).toBe(0);
    // 134,500 queued elsewhere out of 150,000: 15,500 buys 10 Guards.
    expect(
      getMaxTrainableQuantity({
        ...base,
        gold: 150_000n,
        citizensQueuedElsewhere: 73,
        goldQueuedElsewhere: 134_500,
      }),
    ).toBe(10);
  });

  it('never returns a negative or non-finite amount', () => {
    expect(
      getMaxTrainableQuantity({ ...base, citizensQueuedElsewhere: 200 }),
    ).toBe(0);
    expect(getMaxTrainableQuantity({ ...base, gold: 0n })).toBe(0);
    expect(getMaxTrainableQuantity({ ...base, unitCost: 0 })).toBe(0);
  });
});
