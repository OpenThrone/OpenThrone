import { describe, expect, it } from 'bun:test';

import { getFortDamageSummary } from './fortDamageSummary';

describe('getFortDamageSummary', () => {
  it('derives damage from the HP before and after', () => {
    expect(getFortDamageSummary({ forthpAtStart: 17, forthpAtEnd: 2 })).toEqual(
      { damage: 15, start: 17, end: 2 },
    );
  });

  it('prefers the stored damage', () => {
    expect(
      getFortDamageSummary({ fortDamage: 4, forthpAtStart: 9, forthpAtEnd: 5 }),
    ).toEqual({ damage: 4, start: 9, end: 5 });
  });

  it('returns null for logs without fort figures', () => {
    expect(getFortDamageSummary({})).toBeNull();
    expect(getFortDamageSummary(undefined)).toBeNull();
    expect(getFortDamageSummary({ forthpAtStart: 10 })).toBeNull();
  });
});
