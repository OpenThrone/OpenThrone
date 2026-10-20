import { describe, expect, it } from 'bun:test';

import { clampMissionQuantity } from '@/utils/missionQuantity';

describe('mission quantity bounds', () => {
  it('caps a selection when available resources decrease', () => {
    expect(clampMissionQuantity(10, 1, 4)).toBe(4);
    expect(clampMissionQuantity(10, 1, 10)).toBe(10);
  });

  it('uses zero when no legal mission can be afforded', () => {
    expect(clampMissionQuantity(1, 1, 0)).toBe(0);
    expect(clampMissionQuantity(3, 3, 2)).toBe(0);
    expect(clampMissionQuantity(1, 1, Number.NaN)).toBe(0);
  });

  it('retains mission-specific minimums and integer steps', () => {
    expect(clampMissionQuantity(1, 3, 10)).toBe(3);
    expect(clampMissionQuantity(4.8, 2, 10)).toBe(4);
    expect(clampMissionQuantity(Number.NaN, 2, 10)).toBe(2);
  });
});
