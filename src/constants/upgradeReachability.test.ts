import { describe, expect, it } from 'bun:test';

import { Fortifications } from '@/constants/Fortifications';
import {
  RACIAL_PERK_TIERS,
  racialFortRequirement,
} from '@/constants/RacialPerks';
import {
  ArmoryUpgrades,
  EconomyUpgrades,
  HouseUpgrades,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
} from '@/constants/Structure_Upgrades';
import { levelXPArray } from '@/constants/XPLevels';
import { CURRENT_COMBAT_RULESET } from '@/utils/balance/combatRulesets';

const MAX_LEVEL = Math.min(
  levelXPArray[levelXPArray.length - 1].level,
  Math.max(...CURRENT_COMBAT_RULESET.levelXp.map((row) => row.level)),
);

/** Highest fort a player at the level cap can build. */
const MAX_REACHABLE_FORT = Math.max(
  ...Fortifications.filter((fort) => fort.levelRequirement <= MAX_LEVEL).map(
    (fort) => fort.level,
  ),
);

const tiers = [
  ...EconomyUpgrades.map((tier) => ({
    key: `economy:${tier.name}`,
    fort: tier.fortLevel,
  })),
  ...Object.values(HouseUpgrades).map((tier) => ({
    key: `housing:${tier.name}`,
    fort: tier.fortLevel,
  })),
  ...OffensiveUpgrades.map((tier) => ({
    key: `offense:${tier.name}`,
    fort: tier.fortLevelRequirement,
  })),
  ...SpyUpgrades.map((tier) => ({
    key: `spy:${tier.name}`,
    fort: tier.fortLevelRequirement,
  })),
  ...SentryUpgrades.map((tier) => ({
    key: `sentry:${tier.name}`,
    fort: tier.fortLevelRequirement,
  })),
  ...ArmoryUpgrades.map((tier) => ({
    key: `armory:${tier.name}`,
    fort: tier.fortLevel,
  })),
  ...['ELF', 'HUMAN', 'UNDEAD', 'GOBLIN'].flatMap((race) =>
    RACIAL_PERK_TIERS.map((_, index) => ({
      key: `racial:${race} tier ${index + 1}`,
      fort: racialFortRequirement(race, index + 1),
    })),
  ),
];

describe('everything is reachable at the level cap', () => {
  it('every fort needs a player level at or below the cap', () => {
    expect(MAX_LEVEL).toBe(100);
    const tooHigh = Fortifications.filter(
      (fort) => fort.levelRequirement > MAX_LEVEL,
    ).map((fort) => `${fort.name} needs ${fort.levelRequirement}`);
    expect(tooHigh).toEqual([]);
    expect(MAX_REACHABLE_FORT).toBe(Fortifications.length);
  });

  it('fort requirements never go down as forts go up', () => {
    const levels = [...Fortifications]
      .sort((a, b) => a.level - b.level)
      .map((fort) => fort.levelRequirement);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  it('the top five forts step by 2 levels up to Empire Level 3 at 100 (#404)', () => {
    const top = Fortifications.filter((fort) => fort.level >= 19).map(
      (fort) => [fort.name, fort.levelRequirement],
    );
    expect(top).toEqual([
      ['Kingdom', 90],
      ['Kingdom Level 2', 92],
      ['Kingdom Level 3', 94],
      ['Empire', 96],
      ['Empire Level 2', 98],
      ['Empire Level 3', 100],
    ]);
  });

  it('every upgrade tier needs a fort a max-level player can build', () => {
    const unreachable = tiers
      .filter((tier) => tier.fort > MAX_REACHABLE_FORT)
      .map((tier) => tier.key);
    expect(unreachable).toEqual([]);
  });

  it('every Economy tier can be bought, Meat Market included', () => {
    for (const tier of EconomyUpgrades) {
      expect(tier.fortLevel).toBeLessThanOrEqual(MAX_REACHABLE_FORT);
    }
    expect(EconomyUpgrades[EconomyUpgrades.length - 1].fortLevel).toBe(21);
  });
});
