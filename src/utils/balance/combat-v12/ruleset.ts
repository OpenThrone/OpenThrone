import { deriveCombatRuleset } from '@/utils/balance/combatRuleset';

import { COMBAT_V11 } from '../combat-v11/ruleset';

/**
 * combat-v12: per-battle casualty caps round by chance instead of down. The
 * 8% single-attack cap and the soft budget cap round up with probability
 * equal to their fraction (one draw per side per battle), so an army of 12 or
 * fewer, whose cap floored to zero, now loses units at the intended rate on
 * average. Every other number is combat-v11's.
 *
 * This file is a frozen copy once shipped: a balance change adds a new
 * ruleset built on this one (see combatRulesets.ts).
 */
export const COMBAT_V12 = deriveCombatRuleset(COMBAT_V11, 'combat-v12', {
  casualtyRounding: 'stochastic',
});
