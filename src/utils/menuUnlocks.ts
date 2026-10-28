import { BattleUpgrades } from '@/constants/Battle_Upgrades';

import { getBattleUpgradeStructure } from './battleUpgradeStructure';
import { FIRST_STRUCTURE_UPGRADE_LEVEL } from './tutorialState';

type MenuProgress = {
  readonly level: number;
  readonly offensiveLevel: number;
  readonly spyLevel: number;
};

/** Structure Upgrades has nothing to buy before the Village fortification. */
export const isStructureUpgradesUnlocked = (progress: MenuProgress) =>
  progress.level >= FIRST_STRUCTURE_UPGRADE_LEVEL;

/**
 * Battle Upgrades opens once any upgrade clears the siege/clandestine level it
 * needs, the same test the page and the purchase use.
 */
export const isBattleUpgradesUnlocked = (progress: MenuProgress) =>
  BattleUpgrades.some((upgrade) => {
    const structureLevel =
      getBattleUpgradeStructure(upgrade.type) === 'SPY'
        ? progress.spyLevel
        : progress.offensiveLevel;
    return upgrade.SiegeUpgradeLevel <= (structureLevel ?? 1);
  });
