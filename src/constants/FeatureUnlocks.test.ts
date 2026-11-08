import { describe, expect, it } from 'bun:test';

import {
  FEATURE_KEYS,
  getFeaturePlayerLevel,
  getRequiredEconomyUpgradeName,
  getRequiredFortName,
  hasFeature,
  isFeatureInReach,
} from '@/constants/FeatureUnlocks';
import { levelXPArray } from '@/constants/XPLevels';

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

  it('opens the mercenary hall with the Village fort, at level 5 (#335)', () => {
    expect(getFeaturePlayerLevel('MERCENARY_HALL')).toBe(5);
    expect(getFeaturePlayerLevel('REANIMATION')).toBe(20);
    expect(getRequiredEconomyUpgradeName('MERCENARY_HALL')).toBeNull();
    expect(hasFeature(base, 'MERCENARY_HALL')).toBe(false);
    expect(hasFeature({ ...base, fortLevel: 2 }, 'MERCENARY_HALL')).toBe(true);
  });

  it('opens higher mercenary tiers with the forts that train those units', () => {
    expect(getFeaturePlayerLevel('MERCENARY_COMPANIES')).toBe(15);
    expect(getFeaturePlayerLevel('MERCENARY_ELITE')).toBe(30);
    expect(getRequiredFortName('MERCENARY_COMPANIES')).toBe('Outpost');
    expect(getRequiredFortName('MERCENARY_ELITE')).toBe('Stronghold');
    // No economy upgrade is involved.
    expect(hasFeature({ ...base, fortLevel: 3 }, 'MERCENARY_COMPANIES')).toBe(
      false,
    );
    expect(hasFeature({ ...base, fortLevel: 4 }, 'MERCENARY_COMPANIES')).toBe(
      true,
    );
    expect(hasFeature({ ...base, fortLevel: 6 }, 'MERCENARY_ELITE')).toBe(
      false,
    );
    expect(hasFeature({ ...base, fortLevel: 7 }, 'MERCENARY_ELITE')).toBe(true);
  });

  it('never gates a feature behind a level no player can reach', () => {
    const levelCap = levelXPArray[levelXPArray.length - 1].level;
    for (const key of FEATURE_KEYS) {
      expect(getFeaturePlayerLevel(key) ?? 0).toBeLessThanOrEqual(levelCap);
    }
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

describe('isFeatureInReach', () => {
  it('shows an economy-gated tier only when built or immediately buildable', () => {
    // Gold transfers need the Coal Mine (economy 3, fort 11).
    expect(isFeatureInReach(base, 'GOLD_TRANSFER')).toBe(false);
    expect(
      isFeatureInReach(
        { ...base, economyLevel: 2, fortLevel: 10 },
        'GOLD_TRANSFER',
      ),
    ).toBe(false);
    expect(
      isFeatureInReach(
        { ...base, economyLevel: 1, fortLevel: 11 },
        'GOLD_TRANSFER',
      ),
    ).toBe(false);
    expect(
      isFeatureInReach(
        { ...base, economyLevel: 2, fortLevel: 11 },
        'GOLD_TRANSFER',
      ),
    ).toBe(true);
    expect(
      isFeatureInReach({ ...base, economyLevel: 3 }, 'GOLD_TRANSFER'),
    ).toBe(true);
  });

  it('shows the fort-gated mercenary hall once the fort is built', () => {
    expect(isFeatureInReach(base, 'MERCENARY_HALL')).toBe(false);
    expect(isFeatureInReach({ ...base, fortLevel: 2 }, 'MERCENARY_HALL')).toBe(
      true,
    );
  });
});
