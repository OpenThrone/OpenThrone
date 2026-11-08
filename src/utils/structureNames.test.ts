import { describe, expect, it } from 'bun:test';
import { createInstance } from 'i18next';

import { SpyUpgrades } from '@/constants';
import {
  economyRequirementName,
  fortRequirementName,
  spyUpgradeForLevel,
} from '@/utils/structureNames';

import structures from '../../public/locales/en/structures.json';

const i18n = createInstance();
i18n.init({
  lng: 'en',
  ns: ['structures'],
  defaultNS: 'structures',
  initImmediate: false,
  resources: { en: { structures } },
});

describe('fortRequirementName', () => {
  it('puts the fort level next to the tier name', () => {
    expect(fortRequirementName(i18n.t, 5)).toBe(
      'Outpost Level 2 (fort level 5)',
    );
    expect(fortRequirementName(i18n.t, 2)).toBe('Village (fort level 2)');
  });

  it('returns undefined for an unknown fort level', () => {
    expect(fortRequirementName(i18n.t, 999)).toBeUndefined();
  });
});

describe('economyRequirementName', () => {
  // Mercenary tiers 2 and 3 need economy upgrades that the Economy tab only
  // lists once they are near; the lock must say where to find them (#345).
  it('names the tab and the fort the upgrade needs', () => {
    expect(economyRequirementName(i18n.t, 5)).toBe(
      'Copper Mine — Economy upgrades, needs Kingdom (fort level 19)',
    );
  });

  it('returns undefined for an unknown upgrade', () => {
    expect(economyRequirementName(i18n.t, 99)).toBeUndefined();
  });
});

describe('spyUpgradeForLevel', () => {
  // Mission locks store the 1-based spy level of the first upgrade that
  // grants the mission; the dialog must name that upgrade, not the next one.
  it('names the upgrade that first grants infiltrations', () => {
    const { level } = SpyUpgrades.find((u) => u.maxInfiltrations > 0)!;
    const upgrade = spyUpgradeForLevel(level);
    expect(upgrade?.maxInfiltrations).toBeGreaterThan(0);
    expect(upgrade?.name).toBe('Infiltration Training');
  });

  it('names the upgrade that first grants assassinations', () => {
    const { level } = SpyUpgrades.find((u) => u.maxAssassinations > 0)!;
    const upgrade = spyUpgradeForLevel(level);
    expect(upgrade?.maxAssassinations).toBeGreaterThan(0);
    expect(upgrade?.level).toBe(level);
  });
});
