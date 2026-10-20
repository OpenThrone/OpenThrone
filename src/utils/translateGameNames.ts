import type { TFunction } from 'i18next';

import { Fortifications } from '@/constants';
import { fortificationName } from '@/utils/structureNames';

/** "Royal Guard" -> "royalGuard" */
const toCamelKey = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_match, chr: string) => chr.toUpperCase());

/**
 * Translates an English unit display name from `@/constants/Units`
 * (e.g. "Royal Guard") through the `battle:units.*` keys, falling back to the
 * original name when no key exists.
 */
export const translateUnitName = (t: TFunction, name: string): string => {
  if (!name) return name;
  return t(`units.${toCamelKey(name)}`, { ns: 'battle', defaultValue: name });
};

/**
 * Translates an English battle upgrade name from `@/constants/Battle_Upgrades`
 * (e.g. "War Elephant") through the `battle:battleUpgradeNames.*` keys.
 */
export const translateBattleUpgradeName = (
  t: TFunction,
  name: string,
): string => {
  if (!name) return name;
  return t(`battleUpgradeNames.${toCamelKey(name)}`, {
    ns: 'battle',
    defaultValue: name,
  });
};

/**
 * Translates an English fortification name from `@/constants/Fortifications`
 * (e.g. "Stronghold Level 2") through the `structures:names.fortifications.*`
 * keys, falling back to the original name.
 */
export const translateFortName = (t: TFunction, name: string): string => {
  const fort = Fortifications.find((entry) => entry.name === name);
  if (!fort) {
    return name === 'Unknown'
      ? t('training.unitCard.unknownRequirement', {
          ns: 'battle',
          defaultValue: name,
        })
      : name;
  }
  return fortificationName(t, fort.level) ?? name;
};
