// Features unlocked by structure upgrades. Client-safe: no env or database access.
// The server enforces these with hasFeature; the UI uses getFeatureRequirement
// to show what a locked feature needs.

import { EconomyUpgrades } from '@/constants/Structure_Upgrades';

export const FEATURE_KEYS = [
  'GOLD_TRANSFER',
  'MERCENARY_HALL',
  'MERCENARY_COMPANIES',
  'MERCENARY_ELITE',
  'DUNGEON',
  'REANIMATION',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** The upgrade levels a player has, as stored on the users row. */
export interface FeatureUnlockLevels {
  economyLevel: number; // EconomyUpgrades index (0 = Farm)
  fortLevel: number;
  race?: string | null;
}

export interface FeatureRequirement {
  /** Minimum EconomyUpgrades index. */
  economyLevel?: number;
  /** Minimum fort level. */
  fortLevel?: number;
  /** Only this race can unlock the feature. */
  race?: string;
}

export const FEATURE_REQUIREMENTS: Record<FeatureKey, FeatureRequirement> = {
  GOLD_TRANSFER: { economyLevel: 3 }, // Coal Mine
  MERCENARY_HALL: { economyLevel: 4 }, // Tavern
  MERCENARY_COMPANIES: { economyLevel: 5 }, // Copper Mine
  MERCENARY_ELITE: { economyLevel: 6 }, // Meat Market
  DUNGEON: { fortLevel: 13 }, // Citadel
  REANIMATION: { race: 'UNDEAD', fortLevel: 5 },
};

/** Whether a player's upgrades unlock a feature. */
export const hasFeature = (
  levels: FeatureUnlockLevels,
  key: FeatureKey,
): boolean => {
  const req = FEATURE_REQUIREMENTS[key];
  if (req.race && levels.race?.toUpperCase() !== req.race) return false;
  if (req.economyLevel !== undefined && levels.economyLevel < req.economyLevel)
    return false;
  if (req.fortLevel !== undefined && levels.fortLevel < req.fortLevel)
    return false;
  return true;
};

/** Name of the economy upgrade a feature requires, for "Requires <upgrade>" copy. */
export const getRequiredEconomyUpgradeName = (
  key: FeatureKey,
): string | null => {
  const level = FEATURE_REQUIREMENTS[key].economyLevel;
  if (level === undefined) return null;
  return EconomyUpgrades.find((u) => u.index === level)?.name ?? null;
};
