import { deriveCombatRuleset } from '@/utils/balance/combatRuleset';

import { COMBAT_V13 } from '../combat-v13/ruleset';

/**
 * combat-v14: the Long Sword needs Armory level 6 instead of 7. The Armory
 * stops at level 6, so the sword could never be bought or used in battle.
 * Every other number is combat-v13's.
 *
 * This file is a frozen copy once shipped: a balance change adds a new
 * ruleset built on this one (see combatRulesets.ts).
 */
export const COMBAT_V14 = deriveCombatRuleset(COMBAT_V13, 'combat-v14', {
  items: COMBAT_V13.items.map((item) =>
    item.id === 'OFFENSE_LONG-SWORD' ? { ...item, armoryLevel: 6 } : item,
  ),
});
