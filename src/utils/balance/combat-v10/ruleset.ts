import { deriveCombatRuleset } from '@/utils/balance/combatRuleset';

import { COMBAT_V9 } from '../combat-v9/ruleset';

/**
 * combat-v10 (#203): casualties spread across unit tiers by headcount instead
 * of consuming the lowest level first, so cheap level-1 screens no longer
 * shield valuable high-tier units. Every other number is combat-v9's: each
 * battle's casualty totals, winner, loot and fort damage are exactly what the
 * lowest-first engine produces for the same seed. Only who among the army's
 * stacks the dead are charged to changes (see utils/casualtySpread.ts).
 *
 * This file is a frozen copy once shipped: a balance change adds a new
 * ruleset built on this one (see combatRulesets.ts).
 */
export const COMBAT_V10 = deriveCombatRuleset(COMBAT_V9, 'combat-v10', {
  casualtySpread: true,
});
