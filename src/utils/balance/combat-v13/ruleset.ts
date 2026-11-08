import { deriveCombatRuleset } from '@/utils/balance/combatRuleset';

import { COMBAT_V12 } from '../combat-v12/ruleset';

/**
 * combat-v13: the defender's casualty budget is anchored to the units engaged
 * in the battle — the military that fights and can die — instead of the whole
 * population, mirroring the attacker's offense-only budget. Idle workers and
 * citizens behind standing walls no longer grow the garrison's casualty
 * allowance (#303): the same assault against the same guards fells the same
 * guards whatever the civilian headcount. Civilians fight, can be hit and
 * count as engaged together, from the moment the fort falls; before that
 * they neither help nor count, even once the guards are gone. Every other
 * number is combat-v12's.
 *
 * This file is a frozen copy once shipped: a balance change adds a new
 * ruleset built on this one (see combatRulesets.ts).
 */
export const COMBAT_V13 = deriveCombatRuleset(COMBAT_V12, 'combat-v13', {
  defenderBudgetPopulation: 'engaged',
  civiliansEngageOn: 'fortBreach',
});
