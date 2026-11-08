import type { TFunction } from 'i18next';

import { EconomyUpgrades, Fortifications, SpyUpgrades } from '@/constants';

/** Structure groups with translated display names in `structures:names`. */
export type StructureNameGroup =
  | 'fortifications'
  | 'economy'
  | 'offense'
  | 'spy'
  | 'armory'
  | 'housing';

/** Translates a structure constant's name, keeping the English constant as fallback. */
export const structureName = (
  t: TFunction,
  group: StructureNameGroup,
  id: number | string | undefined,
  fallback: string | undefined,
): string | undefined => {
  if (id === undefined || id === null || fallback === undefined)
    return fallback;
  return t(`names.${group}.${id}`, {
    ns: 'structures',
    defaultValue: fallback,
  });
};

/** Translated fortification name for a fort level, or undefined when unknown. */
export const fortificationName = (
  t: TFunction,
  level: number | undefined,
): string | undefined =>
  structureName(
    t,
    'fortifications',
    level,
    Fortifications.find((fort) => fort.level === level)?.name,
  );

/**
 * Fort requirement label that names the tier and its place on the ladder,
 * e.g. "Outpost Level 2 (fort level 5)", so requirements read in order.
 */
export const fortRequirementName = (
  t: TFunction,
  level: number | undefined,
): string | undefined => {
  const name = fortificationName(t, level);
  if (name === undefined) return undefined;
  return t('upgrades.fortTier', {
    ns: 'structures',
    name,
    level,
    defaultValue: '{{name}} (fort level {{level}})',
  });
};

/** Clandestine upgrade that unlocks at a 1-based spy level, if any. */
export const spyUpgradeForLevel = (level: number | undefined) =>
  level === undefined ? undefined : SpyUpgrades.find((u) => u.level === level);

/**
 * Economy upgrade requirement that says where the upgrade is built and the
 * fort it needs, e.g. "Copper Mine — Economy upgrades, needs Kingdom (fort level 19)".
 */
export const economyRequirementName = (
  t: TFunction,
  index: number | undefined,
): string | undefined => {
  const upgrade = EconomyUpgrades.find((u) => u.index === index);
  if (!upgrade) return undefined;
  const name = structureName(t, 'economy', upgrade.index, upgrade.name);
  const fort = fortRequirementName(t, upgrade.fortLevel);
  if (!fort) return name;
  return t('upgrades.economyTier', {
    ns: 'structures',
    name,
    fort,
    defaultValue: '{{name}} — Economy upgrades, needs {{fort}}',
  });
};
