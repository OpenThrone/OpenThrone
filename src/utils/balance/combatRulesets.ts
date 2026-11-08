import { COMBAT_V9 } from './combat-v9/ruleset';
import { COMBAT_V10 } from './combat-v10/ruleset';
import { COMBAT_V11 } from './combat-v11/ruleset';
import { COMBAT_V12 } from './combat-v12/ruleset';
import { COMBAT_V13 } from './combat-v13/ruleset';
import { COMBAT_V14 } from './combat-v14/ruleset';
import type { CombatRuleset } from './combatRuleset';

/**
 * Every combat ruleset the engine can replay, oldest first. The last entry is
 * the current one: new battles are fought under it and sealed with its
 * `version`. To change balance, append a ruleset built on the previous one:
 *
 *   const COMBAT_V15 = deriveCombatRuleset(COMBAT_V14, 'combat-v15', {
 *     constants: { WOUNDED_SHARE: 0.35 },
 *   });
 *
 * and add it to the end of the list. Never edit a shipped ruleset, and never
 * remove one: its battles could no longer be replayed. Versions without an
 * entry here (v7 and v8) were fought under rules this registry cannot rebuild.
 */
const REGISTERED: readonly CombatRuleset[] = [
  COMBAT_V9,
  COMBAT_V10,
  COMBAT_V11,
  COMBAT_V12,
  COMBAT_V13,
  COMBAT_V14,
];

export const COMBAT_RULESETS: Readonly<Record<string, CombatRuleset>> =
  Object.freeze(
    Object.fromEntries(REGISTERED.map((ruleset) => [ruleset.version, ruleset])),
  );

export const CURRENT_COMBAT_RULESET: CombatRuleset =
  REGISTERED[REGISTERED.length - 1]!;

/** The ruleset a sealed replay was fought under, or undefined when none exists. */
export function getCombatRuleset(version: unknown): CombatRuleset | undefined {
  return typeof version === 'string' &&
    Object.prototype.hasOwnProperty.call(COMBAT_RULESETS, version)
    ? COMBAT_RULESETS[version]
    : undefined;
}
