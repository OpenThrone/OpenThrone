import { describe, expect, it } from 'bun:test';

import {
  isBattleUpgradesUnlocked,
  isStructureUpgradesUnlocked,
} from './menuUnlocks';

describe('menu unlocks', () => {
  it('hides Structure Upgrades until the Village level', () => {
    const base = { offensiveLevel: 1, spyLevel: 1 };
    expect(isStructureUpgradesUnlocked({ ...base, level: 1 })).toBe(false);
    expect(isStructureUpgradesUnlocked({ ...base, level: 4 })).toBe(false);
    expect(isStructureUpgradesUnlocked({ ...base, level: 5 })).toBe(true);
  });

  it('hides Battle Upgrades until a siege or clandestine level opens one', () => {
    const base = { level: 1 };
    expect(
      isBattleUpgradesUnlocked({ ...base, offensiveLevel: 1, spyLevel: 1 }),
    ).toBe(false);
    expect(
      isBattleUpgradesUnlocked({ ...base, offensiveLevel: 6, spyLevel: 1 }),
    ).toBe(true);
  });
});
