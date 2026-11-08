import { deriveCombatRuleset } from '@/utils/balance/combatRuleset';

import { COMBAT_V10 } from '../combat-v10/ruleset';

/**
 * combat-v11 (#334): battle XP follows how real the fight was. A lost attack
 * pays by effort, scaled from nothing at a quarter of the defender's defense
 * to full at three quarters; the defender is paid by the same measure with a
 * 15% floor. A defender who has held one level for more than three game days
 * earns 0.25x more defender XP per further game day, up to 3x, so campers are
 * pushed out of their level range. Every other number is combat-v10's.
 *
 * This file is a frozen copy once shipped: a balance change adds a new
 * ruleset built on this one (see combatRulesets.ts).
 */
export const COMBAT_V11 = deriveCombatRuleset(COMBAT_V10, 'combat-v11', {
  battleXp: {
    effortFloorRatio: 0.25,
    effortFullRatio: 0.75,
    defenderThreatFloor: 0.15,
    stallGraceDays: 3,
    stallPerDay: 0.25,
    stallMaxMultiplier: 3,
  },
});
