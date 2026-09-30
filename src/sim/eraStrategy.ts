import { ItemTypes } from '../constants/Items';
import type { Persona } from './scenarioTypes';
import type { ItemStats, PlayerState } from './types';

export type EraCombatPosture = 'active-raiding' | 'idle-defending';

const OFFENSE_UNITS = (player: PlayerState): number =>
  player.units.soldier + player.units.knight + player.units.berserker;
const DEFENSE_UNITS = (player: PlayerState): number =>
  player.units.guard + player.units.archer + player.units.royalGuard;

interface ItemSlot {
  readonly key: keyof ItemStats;
  readonly usage: 'OFFENSE' | 'DEFENSE';
  readonly type: 'WEAPON' | 'ARMOR';
}

const ITEM_SLOTS: readonly ItemSlot[] = [
  { key: 'meleeAtk', usage: 'OFFENSE', type: 'WEAPON' },
  { key: 'rangedAtk', usage: 'OFFENSE', type: 'ARMOR' },
  { key: 'meleeDef', usage: 'DEFENSE', type: 'WEAPON' },
  { key: 'rangedDef', usage: 'DEFENSE', type: 'ARMOR' },
];

function lowestTierCost(slot: ItemSlot): number {
  const item = ItemTypes.find(
    (candidate) =>
      candidate.usage === slot.usage &&
      candidate.type === slot.type &&
      candidate.level === 1,
  );
  if (!item) {
    throw new Error(`Missing level-one ${slot.usage} ${slot.type} item`);
  }
  return item.cost;
}

/**
 * The live model persists aggregate item quantities by usage. The simulator
 * uses the same aggregate ownership model: stockpiles are durable and are not
 * consumed when a player changes from idle defense to active raiding.
 */
export function calculateItemCoverage(player: PlayerState): number {
  const offense = OFFENSE_UNITS(player);
  const defense = DEFENSE_UNITS(player);
  const totalCombatUnits = offense + defense;
  if (totalCombatUnits === 0) return 1;

  const offenseCoverage = Math.min(
    1,
    Math.min(player.items.meleeAtk, player.items.rangedAtk) /
      Math.max(1, offense),
  );
  const defenseCoverage = Math.min(
    1,
    Math.min(player.items.meleeDef, player.items.rangedDef) /
      Math.max(1, defense),
  );
  return (
    (offense * offenseCoverage + defense * defenseCoverage) / totalCombatUnits
  );
}

/**
 * A declared simulation posture, not a claim that production converts unit
 * types. Active players retain offense stockpiles; idle players retain them
 * while prioritizing coverage for standing defense that protects workers.
 */
export function chooseCombatPosture(
  player: PlayerState,
  persona: Persona,
): EraCombatPosture {
  if (
    player.status === 'active' &&
    player.attackTurns >= 3 &&
    (persona === 'attacker' || persona === 'balanced')
  ) {
    return 'active-raiding';
  }
  return 'idle-defending';
}

/**
 * Buys durable level-one armory stockpile items using real item prices. A
 * modest capped share preserves worker/army reinvestment; stockpiles remain
 * owned across posture changes just like UserItem records in production.
 */
export function purchaseItemStockpile(
  player: PlayerState,
  posture: EraCombatPosture,
): number {
  const offenseTarget = OFFENSE_UNITS(player);
  const defenseTarget = DEFENSE_UNITS(player);
  const budgetFraction = posture === 'active-raiding' ? 0.15 : 0.1;
  let budget = Math.floor(player.gold * budgetFraction);
  let spent = 0;

  for (let index = 0; index < ITEM_SLOTS.length; index += 1) {
    const slot = ITEM_SLOTS[index];
    if (!slot) continue;
    const target = slot.usage === 'OFFENSE' ? offenseTarget : defenseTarget;
    const missing = Math.max(0, target - player.items[slot.key]);
    const cost = lowestTierCost(slot);
    const slotsRemaining = ITEM_SLOTS.length - index;
    const affordable = Math.min(
      missing,
      Math.floor(Math.floor(budget / slotsRemaining) / cost),
    );
    if (affordable <= 0) continue;
    player.items[slot.key] += affordable;
    const slotCost = affordable * cost;
    budget -= slotCost;
    spent += slotCost;
  }
  player.gold -= spent;
  return spent;
}
