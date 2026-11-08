/**
 * Entries of the How to Play "Economy & Structures" section, matching the
 * Structures menu (Bank, Armory, Housing, Repair), the Upgrades page tabs
 * that hold fortifications and economy upgrades (#276), and gold transfers,
 * whose text is built from live settings.
 */
export const HOW_TO_PLAY_ECONOMY_ENTRIES = [
  'bank',
  'armory',
  'housing',
  'repair',
  'fortifications',
  'economyUpgrades',
  'transfers',
] as const;

/** Entries whose body text is generated from live settings, not the locale file. */
export const HOW_TO_PLAY_GENERATED_ENTRIES = ['transfers'] as const;
