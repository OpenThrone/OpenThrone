/** Tabs on Structures → Upgrades, in display order. */
export const UPGRADE_TABS = [
  'fortifications',
  'offense',
  'houses',
  'armory',
  'economy',
  'intel',
  'racial',
] as const;

export type UpgradeTab = (typeof UPGRADE_TABS)[number];

// Names players may have bookmarked or typed for a tab (#348).
const UPGRADE_TAB_ALIASES: Record<string, UpgradeTab> = {
  clandestine: 'intel',
  spy: 'intel',
  siege: 'offense',
  housing: 'houses',
};

/** The tab a URL segment should show; unknown segments fall back to Fortifications. */
export const resolveUpgradeTab = (segment?: string | null): UpgradeTab => {
  const key = (segment ?? '').toLowerCase();
  if ((UPGRADE_TABS as readonly string[]).includes(key))
    return key as UpgradeTab;
  return UPGRADE_TAB_ALIASES[key] ?? 'fortifications';
};
