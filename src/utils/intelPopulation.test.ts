import { describe, expect, it } from 'bun:test';

import { isPopulationObserved } from '@/utils/intelPopulation';

describe('isPopulationObserved', () => {
  it('is false when only an empty mercenary list was gathered (#281)', () => {
    expect(isPopulationObserved({ units: null, mercenaries: [] })).toBe(false);
  });

  it('is true when the unit roster was gathered', () => {
    expect(isPopulationObserved({ units: [], mercenaries: null })).toBe(true);
  });

  it('is true when hired mercenaries were gathered', () => {
    expect(
      isPopulationObserved({ units: null, mercenaries: [{ quantity: 2 }] }),
    ).toBe(true);
  });

  it('is false with no intel', () => {
    expect(isPopulationObserved(null)).toBe(false);
  });
});
