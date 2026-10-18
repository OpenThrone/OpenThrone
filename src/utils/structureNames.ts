import type { TFunction } from 'i18next';

import { Fortifications } from '@/constants';

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
