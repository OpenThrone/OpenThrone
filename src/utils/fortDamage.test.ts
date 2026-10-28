import { describe, expect, it } from 'bun:test';

import { getFortDamageTier } from './fortDamage';

describe('getFortDamageTier', () => {
  it('shows the intact wall until health drops below 75%', () => {
    expect(getFortDamageTier(100)).toBe(0);
    expect(getFortDamageTier(75)).toBe(0);
    expect(getFortDamageTier(74)).toBe(1);
  });

  it('steps down at 50% and 25%', () => {
    expect(getFortDamageTier(50)).toBe(1);
    expect(getFortDamageTier(49)).toBe(2);
    expect(getFortDamageTier(25)).toBe(2);
    expect(getFortDamageTier(24)).toBe(3);
    expect(getFortDamageTier(0)).toBe(3);
  });

  it('treats unknown health as intact', () => {
    expect(getFortDamageTier(undefined)).toBe(0);
    expect(getFortDamageTier(null)).toBe(0);
    expect(getFortDamageTier(Number.NaN)).toBe(0);
  });
});
