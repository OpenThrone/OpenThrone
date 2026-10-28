import { describe, expect, it } from 'bun:test';

import {
  FEATURE_KEYS,
  getRequiredEconomyUpgradeName,
  hasFeature,
} from '@/constants/FeatureUnlocks';

const base = { economyLevel: 0, fortLevel: 1, race: 'HUMAN' };

describe('hasFeature', () => {
  it('locks every feature for a new player', () => {
    for (const key of FEATURE_KEYS) {
      expect(hasFeature(base, key)).toBe(false);
    }
  });

  it('unlocks gold transfers at Coal Mine', () => {
    expect(hasFeature({ ...base, economyLevel: 2 }, 'GOLD_TRANSFER')).toBe(
      false,
    );
    expect(hasFeature({ ...base, economyLevel: 3 }, 'GOLD_TRANSFER')).toBe(
      true,
    );
    expect(getRequiredEconomyUpgradeName('GOLD_TRANSFER')).toBe('Coal Mine');
  });

  it('opens the mercenary hall at Tavern', () => {
    expect(getRequiredEconomyUpgradeName('MERCENARY_HALL')).toBe('Tavern');
  });

  it('keeps reanimation Undead-only', () => {
    expect(hasFeature({ ...base, fortLevel: 30 }, 'REANIMATION')).toBe(false);
    expect(
      hasFeature({ ...base, fortLevel: 5, race: 'undead' }, 'REANIMATION'),
    ).toBe(true);
    expect(
      hasFeature({ ...base, fortLevel: 4, race: 'UNDEAD' }, 'REANIMATION'),
    ).toBe(false);
  });
});
