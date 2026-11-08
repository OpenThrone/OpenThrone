import { CURRENT_COMBAT_RULESET } from '@/utils/balance/combatRulesets';

export const PLAYER_CLASSES = [
  'FIGHTER',
  'CLERIC',
  'ASSASSIN',
  'THIEF',
] as const;
export type PlayerClass = (typeof PLAYER_CLASSES)[number];

/** A class's permanent bonus in percent, from the live combat ruleset. */
export function getClassBonusPercent(playerClass: PlayerClass): number {
  return CURRENT_COMBAT_RULESET.bonuses
    .filter((bonus) => bonus.race === playerClass)
    .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);
}
