import { useTranslation } from 'next-i18next';

/**
 * Localized display names for the player identity pair ("Human Fighter"),
 * sourced from the lore race names (`how-to-play`) and the shared class
 * labels (`common`). Replaces raw enum output like "HUMAN FIGHTER".
 */
export const usePlayerIdentity = () => {
  const { t: tLore } = useTranslation('how-to-play');
  const { t: tCommon } = useTranslation('common');
  return {
    raceName: (race: string) => tLore(`races.${race.toLowerCase()}.name`),
    className: (playerClass: string) => tCommon(`classes.${playerClass}`),
  };
};
