/**
 * How live-rules players spend: bonus points, training, equipment, and the
 * kingdom morale that follows from their battles. See liveRules.ts for the
 * schedule, structures and protection rules these build on.
 */
import { BattleUpgrades } from '../constants/Battle_Upgrades';
import { applyEventDiscount } from '../constants/gameEvents';
import { ItemTypes } from '../constants/Items';
import {
  ARMY_DESERTION_MORALE_THRESHOLD,
  armyDesertionAllowance,
  armyDesertionQuantity,
  CITIZENS_DESERTION_MORALE_THRESHOLD,
  citizensDesertionQuantity,
  defectorRecipientDailyCap,
  distributeDesertion,
  KINGDOM_MORALE_MAX,
  KINGDOM_MORALE_MIN,
  MORALE_DAILY_ACTIVE_BONUS,
  MORALE_DEFENSE_LOST,
  MORALE_DEFENSE_WON,
  splitDefectors,
} from '../constants/KingdomMorale';
import { UnitTypes } from '../constants/Units';
import type { ItemType } from '../types/typings';
import { calculateTurnIncome } from './economy';
import { hireMercenaries } from './liveForces';
import {
  bonusPointPercent,
  nextStructureCost,
  pay,
  refreshStructureEffects,
} from './liveRules';
import type {
  BonusPointCategory,
  LiveItem,
  PlayerState,
  PlayStyle,
  UnitCounts,
} from './types';

type UnitKey = keyof UnitCounts;

/** Points a category may hold (Account.service). */
export const BONUS_POINT_CAP = 75;

const BONUS_POINT_WEIGHTS: Record<
  PlayStyle,
  Partial<Record<BonusPointCategory, number>>
> = {
  aggressive: { OFFENSE: 0.6, DEFENSE: 0.2, INCOME: 0.2 },
  defensive: { DEFENSE: 0.6, OFFENSE: 0.1, INCOME: 0.3 },
  balanced: { OFFENSE: 0.35, DEFENSE: 0.35, INCOME: 0.3 },
  economist: { INCOME: 0.5, PRICES: 0.3, DEFENSE: 0.2 },
  'spy-focused': { INTEL: 0.5, OFFENSE: 0.25, INCOME: 0.25 },
};

const UNIT_LINES: Record<'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY', UnitKey[]> =
  {
    OFFENSE: ['soldier', 'knight', 'berserker'],
    DEFENSE: ['guard', 'archer', 'royalGuard'],
    SPY: ['spy', 'infiltrator', 'assassin'],
    SENTRY: ['sentry', 'sentinel', 'inquisitor'],
  };

/** Equipment slots in the order a player fills them: biggest stat gain first. */
const ITEM_SLOTS: ItemType[] = [
  'WEAPON',
  'ARMOR',
  'SHIELD',
  'HELM',
  'BOOTS',
  'BRACERS',
];

/** Share of the spending budget that goes to training before equipment. */
const TRAINING_BUDGET_SHARE = 0.6;

/** Share of the army budget a player with the mercenary hall spends on mercenaries. */
const MERCENARY_BUDGET_SHARE = 0.1;

/** Saving for a structure is worth it when it costs at most this many days of income. */
const STRUCTURE_SAVING_DAYS = 5;

/** Spends unspent bonus points (one per level) by play style, capped per category. */
export function allocateBonusPoints(player: PlayerState): void {
  player.bonusPoints ??= {
    OFFENSE: 0,
    DEFENSE: 0,
    INCOME: 0,
    INTEL: 0,
    PRICES: 0,
  };
  const points = player.bonusPoints;
  const weights =
    BONUS_POINT_WEIGHTS[player.behavior.playStyle] ??
    BONUS_POINT_WEIGHTS.balanced;
  const categories = Object.keys(weights) as BonusPointCategory[];
  let spent = Object.values(points).reduce((sum, value) => sum + value, 0);
  while (spent < player.level) {
    // The category furthest below its weighted share of all points.
    const total = spent + 1;
    const open = categories.filter((key) => points[key] < BONUS_POINT_CAP);
    if (open.length === 0) break;
    const next = open.reduce((best, key) =>
      (weights[key] ?? 0) * total - points[key] >
      (weights[best] ?? 0) * total - points[best]
        ? key
        : best,
    );
    points[next] += 1;
    spent += 1;
  }
  refreshStructureEffects(player);
}

/** Event discounts on training and armory prices, in percent. */
export interface EventDiscounts {
  unit: number;
  armory: number;
}

const NO_DISCOUNTS: EventDiscounts = { unit: 0, armory: 0 };

/**
 * A unit or item price after the PRICES bonus (utils/units, armoryPricing),
 * then any event discount, as Training.service and Armory.service apply them.
 */
export function discountedPrice(
  player: PlayerState,
  cost: number,
  eventDiscountPercent = 0,
): number {
  const percent = bonusPointPercent(player, 'PRICES');
  return applyEventDiscount(
    Math.max(0, cost - Math.ceil((percent / 100) * cost)),
    eventDiscountPercent,
  );
}

function unitDefinition(line: keyof typeof UNIT_LINES, level: number) {
  return UnitTypes.find((unit) => unit.type === line && unit.level === level);
}

/**
 * Trains `citizens` into one unit line, spending at most `budget`: as many as
 * the budget allows at the best unlocked tier, with the rest at tier 1.
 * Returns the gold spent.
 */
function trainLine(
  player: PlayerState,
  line: keyof typeof UNIT_LINES,
  citizens: number,
  budget: number,
  discount: number,
): number {
  if (citizens <= 0 || budget <= 0) return 0;
  const keys = UNIT_LINES[line];
  let topLevel = 1;
  for (let level = 3; level >= 1; level--) {
    if ((unitDefinition(line, level)?.fortLevel ?? 99) <= player.fortLevel) {
      topLevel = level;
      break;
    }
  }
  const tier1 = discountedPrice(
    player,
    unitDefinition(line, 1)?.cost ?? 0,
    discount,
  );
  const top = discountedPrice(
    player,
    unitDefinition(line, topLevel)?.cost ?? 0,
    discount,
  );
  let atTier1: number;
  let atTop = 0;
  if (topLevel === 1 || budget < citizens * tier1) {
    atTier1 = tier1 > 0 ? Math.min(citizens, Math.floor(budget / tier1)) : 0;
  } else {
    atTop = Math.min(
      citizens,
      Math.floor((budget - citizens * tier1) / Math.max(1, top - tier1)),
    );
    atTier1 = citizens - atTop;
  }
  const cost = atTier1 * tier1 + atTop * top;
  player.units[keys[0]] += atTier1;
  player.units[keys[topLevel - 1]] += atTop;
  player.units.citizen -= atTier1 + atTop;
  pay(player, cost);
  return cost;
}

function trainWorkers(
  player: PlayerState,
  citizens: number,
  budget: number,
  discount: number,
): number {
  const price = discountedPrice(
    player,
    UnitTypes.find((unit) => unit.type === 'WORKER')?.cost ?? 0,
    discount,
  );
  const count =
    price > 0 ? Math.min(citizens, Math.floor(budget / price)) : citizens;
  player.units.worker += count;
  player.units.citizen -= count;
  pay(player, count * price);
  return count * price;
}

/**
 * Trains the player's untrained citizens by play style: workers for income,
 * a few spies and sentries, and the rest into offense and defense by
 * aggression. Returns the gold spent.
 */
export function trainCitizens(
  player: PlayerState,
  budget: number,
  discount = 0,
): number {
  const citizens = player.units.citizen;
  if (citizens <= 0 || budget <= 0) return 0;
  const { aggression, wealthPreference, spyPreference } = player.behavior;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const workers = Math.floor(
    citizens * clamp(0.15 + 0.5 * wealthPreference, 0.1, 0.6),
  );
  const spies = Math.floor(citizens * (0.02 + 0.08 * spyPreference));
  const sentries = Math.floor(citizens * (0.02 + 0.08 * spyPreference));
  const combat = citizens - workers - spies - sentries;
  const offense = Math.floor(combat * clamp(aggression, 0.2, 0.8));
  const defense = combat - offense;

  let remaining = budget;
  remaining -= trainWorkers(player, workers, remaining, discount);
  remaining -= trainLine(player, 'SPY', spies, remaining, discount);
  remaining -= trainLine(player, 'SENTRY', sentries, remaining, discount);
  const offenseBudget = remaining * (offense / Math.max(1, combat));
  remaining -= trainLine(player, 'OFFENSE', offense, offenseBudget, discount);
  remaining -= trainLine(player, 'DEFENSE', defense, remaining, discount);
  return budget - remaining;
}

/** The cheapest item of this usage, slot and level the player may buy, if any. */
function buyableItem(
  player: PlayerState,
  usage: keyof typeof UNIT_LINES,
  slot: ItemType,
  level: number,
) {
  return ItemTypes.filter(
    (item) =>
      item.usage === usage &&
      item.type === slot &&
      item.level === level &&
      (item.race === 'ALL' || item.race === player.race) &&
      (item.armoryLevel ?? 1) <= (player.armoryLevel ?? 1),
  ).sort((a, b) => a.cost - b.cost)[0];
}

/**
 * Units of each level (index 0 = level 1) left without an item in `slot`
 * after the battle code's assignment: items fill the highest-level units
 * first and only fit units of at least their own level.
 */
export function uncoveredUnits(
  player: PlayerState,
  usage: keyof typeof UNIT_LINES,
  slot: ItemType,
): number[] {
  const remaining = UNIT_LINES[usage].map((key) => player.units[key]);
  for (let itemLevel = 3; itemLevel >= 1; itemLevel--) {
    let available = (player.inventory ?? [])
      .filter(
        (item) =>
          item.usage === usage &&
          item.type === slot &&
          item.level === itemLevel,
      )
      .reduce((sum, item) => sum + item.quantity, 0);
    for (
      let unitLevel = 3;
      unitLevel >= itemLevel && available > 0;
      unitLevel--
    ) {
      const covered = Math.min(remaining[unitLevel - 1], available);
      remaining[unitLevel - 1] -= covered;
      available -= covered;
    }
  }
  return remaining;
}

function addItems(
  player: PlayerState,
  item: Omit<LiveItem, 'quantity'>,
  count: number,
) {
  player.inventory ??= [];
  const { inventory } = player;
  const row = inventory.find(
    (entry) =>
      entry.usage === item.usage &&
      entry.type === item.type &&
      entry.level === item.level,
  );
  if (row) row.quantity += count;
  else inventory.push({ ...item, quantity: count });
}

/** Buys `usage` items for units that lack them, within `budget`. Returns the gold spent. */
function equipLine(
  player: PlayerState,
  usage: keyof typeof UNIT_LINES,
  budget: number,
  discount: number,
): number {
  let remaining = budget;
  for (const slot of ITEM_SLOTS) {
    const uncovered = uncoveredUnits(player, usage, slot);
    for (let unitLevel = 3; unitLevel >= 1; unitLevel--) {
      const need = uncovered[unitLevel - 1];
      if (need <= 0) continue;
      let item;
      for (let level = unitLevel; level >= 1 && !item; level--) {
        item = buyableItem(player, usage, slot, level);
      }
      if (!item) continue;
      const price = discountedPrice(player, item.cost, discount);
      const count =
        price > 0 ? Math.min(need, Math.floor(remaining / price)) : need;
      if (count <= 0) continue;
      addItems(player, { usage, type: slot, level: item.level }, count);
      pay(player, count * price);
      remaining -= count * price;
    }
  }
  return budget - remaining;
}

/**
 * Covers level 2+ offense and defense units with battle upgrades once the
 * offensive structure allows them (Battle.service). Only upgrades costing at
 * most 10x the line's best unit per covered unit are bought, which keeps the
 * 5M War Elephant and Catapult for players who could field them in numbers.
 * Returns the gold spent.
 */
export function buyBattleUpgrades(player: PlayerState, budget: number): number {
  let remaining = budget;
  for (const type of ['OFFENSE', 'DEFENSE'] as const) {
    const eligible = UNIT_LINES[type]
      .slice(1)
      .reduce((sum, key) => sum + player.units[key], 0);
    const owned = (player.battleUpgrades ??= []).filter(
      (upgrade) => upgrade.type === type,
    );
    let covered = owned.reduce(
      (sum, upgrade) =>
        sum +
        upgrade.quantity *
          (BattleUpgrades.find(
            (entry) => entry.type === type && entry.level === upgrade.level,
          )?.unitsCovered ?? 1),
      0,
    );
    const bestUnitCost = Math.max(
      ...[1, 2, 3].map((level) => unitDefinition(type, level)?.cost ?? 0),
    );
    const options = BattleUpgrades.filter(
      (upgrade) =>
        upgrade.type === type &&
        (upgrade.SiegeUpgradeLevel ?? 0) <=
          (player.offenseStructureLevel ?? 1) &&
        upgrade.cost / (upgrade.unitsCovered || 1) <= bestUnitCost * 10,
    ).sort((a, b) => b.level - a.level);
    for (const upgrade of options) {
      const perUnit = upgrade.unitsCovered || 1;
      const need = Math.ceil(Math.max(0, eligible - covered) / perUnit);
      const price = discountedPrice(player, upgrade.cost);
      const count =
        price > 0 ? Math.min(need, Math.floor(remaining / price)) : need;
      if (count <= 0) continue;
      const row = player.battleUpgrades.find(
        (entry) => entry.type === type && entry.level === upgrade.level,
      );
      if (row) row.quantity += count;
      else
        player.battleUpgrades.push({
          type,
          level: upgrade.level,
          quantity: count,
        });
      pay(player, count * price);
      remaining -= count * price;
      covered += count * perUnit;
    }
  }
  return budget - remaining;
}

/**
 * Equips units that lack items, slot by slot, with the best item each unit
 * can use, then buys battle upgrades. Spies and sentries get a share by spy
 * preference; offense and defense split the rest by aggression. Items are
 * never lost in battle, so they pass to replacement units. Returns the gold
 * spent.
 */
export function equipArmy(
  player: PlayerState,
  budget: number,
  discount = 0,
): number {
  if (budget <= 0) return 0;
  const clandestine = budget * (0.05 + 0.15 * player.behavior.spyPreference);
  const combat = budget - clandestine;
  const offenseShare = Math.min(0.8, Math.max(0.2, player.behavior.aggression));
  let spent = 0;
  spent += equipLine(player, 'OFFENSE', combat * offenseShare, discount);
  spent += equipLine(player, 'DEFENSE', combat - spent, discount);
  spent += buyBattleUpgrades(player, combat - spent);
  const spyBudget = clandestine / 2;
  spent += equipLine(player, 'SPY', spyBudget, discount);
  spent += equipLine(player, 'SENTRY', budget - spent, discount);
  return spent;
}

/**
 * Spends on the army while logged in: training first, then equipment. Keeps
 * back a savings reserve by wealth preference, and for the next structure
 * when it is within a few days of income.
 */
export function spendOnArmy(
  player: PlayerState,
  ticksPerDay: number,
  discounts: EventDiscounts = NO_DISCOUNTS,
  day?: number,
): number {
  const wealth = player.gold + player.goldInBank;
  const structure = nextStructureCost(player);
  const dailyIncome = calculateTurnIncome(player) * ticksPerDay;
  // buyNextStructure spends at most half of wealth, so save twice the price.
  const saving =
    structure > 0 && structure <= dailyIncome * STRUCTURE_SAVING_DAYS
      ? structure * 2
      : 0;
  const reserve = Math.max(
    wealth * player.behavior.wealthPreference * 0.5,
    saving,
  );
  const budget = Math.max(0, wealth - reserve);
  const training = trainCitizens(
    player,
    budget * TRAINING_BUDGET_SHARE,
    discounts.unit,
  );
  // Once unlocked, mercenaries get a share before equipment takes the rest.
  const mercenaries =
    day === undefined
      ? 0
      : hireMercenaries(player, budget * MERCENARY_BUDGET_SHARE, day);
  const equipment = equipArmy(
    player,
    budget - training - mercenaries,
    discounts.armory,
  );
  return training + mercenaries + equipment;
}

function clampMorale(value: number): number {
  return Math.min(KINGDOM_MORALE_MAX, Math.max(KINGDOM_MORALE_MIN, value));
}

/** Defender morale after a battle; protected defenders are exempt (AttackService). */
export function applyBattleMorale(
  defender: PlayerState,
  attackerWon: boolean,
  defenderProtected: boolean,
): void {
  if (defenderProtected || defender.kingdomMorale === undefined) return;
  defender.kingdomMorale = clampMorale(
    defender.kingdomMorale +
      (attackerWon ? MORALE_DEFENSE_LOST : MORALE_DEFENSE_WON),
  );
}

const ARMY_KEYS: UnitKey[] = [
  ...UNIT_LINES.OFFENSE,
  ...UNIT_LINES.DEFENSE,
  ...UNIT_LINES.SPY,
  ...UNIT_LINES.SENTRY,
];

function armySize(player: PlayerState): number {
  return ARMY_KEYS.reduce((sum, key) => sum + player.units[key], 0);
}

/**
 * The daily morale step for a player who logged in today, as
 * KingdomMorale.service: the active bonus, then citizens leave below 40 and
 * the army deserts below 20. The desertion floor is recorded at the first
 * crossing and only ratchets up, so the run's total bleed stays at 25% of
 * that army. Returns the trained units that deserted and how many of them
 * defect (split per stack, as the live service does).
 */
export function applyDailyMorale(
  player: PlayerState,
  /** Other daily morale changes applied with the active bonus, e.g. broke upkeep. */
  extraDelta = 0,
): {
  deserted: number;
  defectors: number;
} {
  const none = { deserted: 0, defectors: 0 };
  if (player.kingdomMorale === undefined) return none;
  player.kingdomMorale = clampMorale(
    player.kingdomMorale + MORALE_DAILY_ACTIVE_BONUS + extraDelta,
  );
  if (player.kingdomMorale < CITIZENS_DESERTION_MORALE_THRESHOLD) {
    player.units.citizen -= citizensDesertionQuantity(player.units.citizen);
  }
  const army = armySize(player);
  if (player.kingdomMorale >= ARMY_DESERTION_MORALE_THRESHOLD) {
    if (player.desertionFloor !== undefined && army > player.desertionFloor) {
      player.desertionFloor = army;
    }
    return none;
  }
  player.desertionFloor ??= army;
  const loss = Math.min(
    armyDesertionQuantity(army),
    armyDesertionAllowance(army, player.desertionFloor),
  );
  const losses = distributeDesertion(
    ARMY_KEYS.map((key) => player.units[key]),
    loss,
  );
  ARMY_KEYS.forEach((key, index) => {
    player.units[key] -= losses[index];
  });
  return {
    deserted: losses.reduce((sum, value) => sum + value, 0),
    defectors: losses.reduce(
      (sum, value) => sum + splitDefectors(value).defect,
      0,
    ),
  };
}

/**
 * Defectors join the defender's top attacker as untrained citizens, capped at
 * 1% of that attacker's own army per day across all deserting kingdoms.
 * Returns the defectors accepted.
 */
export function applyDefection(
  recipient: PlayerState,
  defectors: number,
  receivedToday: number,
): number {
  const room = Math.max(
    0,
    defectorRecipientDailyCap(armySize(recipient)) - receivedToday,
  );
  const accepted = Math.min(room, defectors);
  recipient.units.citizen += accepted;
  return accepted;
}

/** Share of a player's offense and defense units that carry a weapon. */
export function armedShare(player: PlayerState): number {
  let units = 0;
  let uncovered = 0;
  for (const usage of ['OFFENSE', 'DEFENSE'] as const) {
    units += UNIT_LINES[usage].reduce((sum, key) => sum + player.units[key], 0);
    uncovered += uncoveredUnits(player, usage, 'WEAPON').reduce(
      (sum, value) => sum + value,
      0,
    );
  }
  return units > 0 ? (units - uncovered) / units : 0;
}
