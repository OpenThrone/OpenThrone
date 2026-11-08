/**
 * Mercenaries and the dungeon for live-rules players, mirroring
 * Mercenary.service and Captives.service with the live constants.
 */
import {
  CAPTIVE_MAX_DAYS,
  captureQuantity,
  CONVERT_COST_PERCENT,
  CONVERT_MIN_HOURS,
  distributeCaptures,
  DUNGEON_FORT_LEVEL,
  dungeonCapacity,
  RANSOM_CAPTOR_SHARE,
  RANSOM_PERCENT,
} from '../constants/Captives';
import { FEATURE_REQUIREMENTS } from '../constants/FeatureUnlocks';
import { ItemTypes } from '../constants/Items';
import {
  ARMY_DESERTION_MORALE_THRESHOLD,
  distributeDesertion,
  mercenaryDesertionQuantity,
  MORALE_BROKE_MERCENARY_UPKEEP,
} from '../constants/KingdomMorale';
import { UnitTypes } from '../constants/Units';
import { V5_COMBAT_CONSTANTS } from '../utils/balance/v5Combat';
import {
  MERCENARY_ROLE_CAP,
  mercenaryShareCap,
  mercenaryTierFeatureKey,
} from '../utils/temporaryForces';
import { pay } from './liveRules';
import type { PlayerState, UnitCounts } from './types';

type UnitKey = keyof UnitCounts;
type MercenaryRole = 'OFFENSE' | 'DEFENSE';

/** Contract length the sim hires for, in days (live offers 1, 3 or 7). */
export const MERCENARY_TERM_DAYS = 3;

const LINES: Record<'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY', UnitKey[]> = {
  OFFENSE: ['soldier', 'knight', 'berserker'],
  DEFENSE: ['guard', 'archer', 'royalGuard'],
  SPY: ['spy', 'infiltrator', 'assassin'],
  SENTRY: ['sentry', 'sentinel', 'inquisitor'],
};

const TRAINED_KEYS = Object.values(LINES).flat();

function unitOf(key: UnitKey): { type: keyof typeof LINES; level: number } {
  for (const [type, keys] of Object.entries(LINES)) {
    const index = keys.indexOf(key);
    if (index >= 0)
      return { type: type as keyof typeof LINES, level: index + 1 };
  }
  throw new Error(`Not a trained unit: ${key}`);
}

function unitCost(type: string, level: number): number {
  return (
    UnitTypes.find((unit) => unit.type === type && unit.level === level)
      ?.cost ?? 0
  );
}

function trainedArmy(player: PlayerState): number {
  return TRAINED_KEYS.reduce((sum, key) => sum + player.units[key], 0);
}

/** The fixed kit a mercenary of this role and tier brings (Mercenary.service mercenaryOffer). */
function mercenaryKit(role: MercenaryRole, level: number) {
  return ItemTypes.filter(
    (item) =>
      item.usage === role && item.level === level && item.race === 'ALL',
  );
}

/** Gold to hire one mercenary for `termDays`: mobilization plus the daily price. */
export function mercenaryUnitPrice(
  role: MercenaryRole,
  level: number,
  termDays = MERCENARY_TERM_DAYS,
): number {
  const cost = unitCost(role, level);
  const kitCost = mercenaryKit(role, level).reduce(
    (sum, item) => sum + item.cost,
    0,
  );
  return Math.ceil(cost * 1.25) + termDays * Math.ceil((cost + kitCost) * 0.05);
}

/** Highest mercenary tier the player's economy and fort unlock, or 0. */
export function mercenaryTier(
  player: PlayerState,
  role: MercenaryRole,
): number {
  for (let level = 3; level >= 1; level--) {
    // Feature unlocks use the live 0-based economy index; sim levels are 1-based.
    const economy =
      FEATURE_REQUIREMENTS[mercenaryTierFeatureKey(level)].economyLevel ?? 0;
    const fort =
      UnitTypes.find((unit) => unit.type === role && unit.level === level)
        ?.fortLevel ?? 99;
    if (player.economyLevel - 1 >= economy && player.fortLevel >= fort) {
      return level;
    }
  }
  return 0;
}

/**
 * Hires mercenaries with `budget` for the role the player leans to, within
 * the live caps: 100 per role and half of the player's own trained army in
 * total. Refused below the desertion morale threshold. Returns the gold spent.
 */
export function hireMercenaries(
  player: PlayerState,
  budget: number,
  day: number,
): number {
  if ((player.kingdomMorale ?? 100) < ARMY_DESERTION_MORALE_THRESHOLD) return 0;
  const role: MercenaryRole =
    player.behavior.aggression >= 0.5 ? 'OFFENSE' : 'DEFENSE';
  const level = mercenaryTier(player, role);
  if (level === 0) return 0;
  player.mercenaries ??= [];
  const contracts = player.mercenaries;
  const total = contracts.reduce((sum, c) => sum + c.quantity, 0);
  const forRole = contracts
    .filter((c) => c.type === role)
    .reduce((sum, c) => sum + c.quantity, 0);
  const room = Math.min(
    MERCENARY_ROLE_CAP - forRole,
    mercenaryShareCap(trainedArmy(player)) - total,
  );
  const price = mercenaryUnitPrice(role, level);
  const quantity = Math.min(room, Math.floor(budget / price));
  if (quantity <= 0) return 0;
  contracts.push({
    id: contracts.reduce((max, c) => Math.max(max, c.id), 0) + 1,
    type: role,
    level,
    quantity,
    expiresOnDay: day + MERCENARY_TERM_DAYS,
  });
  pay(player, quantity * price);
  if (player.simStats) player.simStats.mercenariesHired += quantity;
  return quantity * price;
}

/** Battle roster rows for the player's active contracts (Mercenary.service contractRoster). */
export function mercenaryRoster(player: PlayerState) {
  return (player.mercenaries ?? [])
    .filter((contract) => contract.quantity - (contract.wounded ?? 0) > 0)
    .map((contract) => ({
      id: -contract.id,
      userId: 0,
      type: contract.type,
      level: contract.level,
      quantity: contract.quantity - (contract.wounded ?? 0),
      isMercenary: true,
      forceContractId: contract.id,
      forceKind: 'MERCENARY' as const,
      forceEquipment: mercenaryKit(contract.type, contract.level)
        .map((item) => ({ type: item.type, level: item.level }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    }));
}

/**
 * Takes battle losses off the player's contracts: the killed leave the
 * contract, the wounded stay on it but sit out until they heal.
 */
export function applyMercenaryLosses(
  player: PlayerState,
  killed: Record<number, number> | undefined,
  wounded: Record<number, number> | undefined,
): void {
  for (const contract of player.mercenaries ?? []) {
    contract.quantity = Math.max(
      0,
      contract.quantity - (killed?.[contract.id] ?? 0),
    );
    contract.wounded = Math.min(
      contract.quantity,
      (contract.wounded ?? 0) + (wounded?.[contract.id] ?? 0),
    );
  }
}

/**
 * The start of a mercenary day: expired and emptied contracts end, and the
 * daily share of wounded mercenaries returns to duty. Returns the morale
 * change for a broke kingdom still holding contracts.
 */
export function startMercenaryDay(player: PlayerState, day: number): number {
  if (!player.mercenaries) return 0;
  player.mercenaries = player.mercenaries.filter(
    (contract) => contract.expiresOnDay > day && contract.quantity > 0,
  );
  for (const contract of player.mercenaries) {
    const wounded = contract.wounded ?? 0;
    if (wounded <= 0) continue;
    contract.wounded =
      wounded -
      Math.min(
        wounded,
        Math.max(
          1,
          Math.floor(wounded * V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY),
        ),
      );
  }
  return player.mercenaries.length > 0 && player.gold <= 0
    ? MORALE_BROKE_MERCENARY_UPKEEP
    : 0;
}

/** 10% of surviving mercenaries walk out a day while morale is below 20. */
export function desertMercenaries(player: PlayerState): void {
  if (!player.mercenaries?.length) return;
  if ((player.kingdomMorale ?? 100) >= ARMY_DESERTION_MORALE_THRESHOLD) return;
  const survivors = player.mercenaries.map((contract) => contract.quantity);
  const losses = distributeDesertion(
    survivors,
    mercenaryDesertionQuantity(survivors.reduce((sum, n) => sum + n, 0)),
  );
  player.mercenaries.forEach((contract, index) => {
    contract.quantity -= losses[index];
    contract.wounded = Math.min(contract.wounded ?? 0, contract.quantity);
  });
}

/**
 * Captures 10% of the defender's killed own combat units into the attacker's
 * dungeon, when the attacker won, breached the fort, owns a fort of level 13
 * or more, and the defender is not protected. Capacity is 200 at fort 13 plus
 * 50 per level above. The captives are already dead to the defender.
 * Returns the number captured.
 */
export function captureFromBattle(params: {
  attacker: PlayerState;
  defender: PlayerState;
  attackerWon: boolean;
  fortBreached: boolean;
  defenderProtected: boolean;
  killed: Partial<UnitCounts>;
  day: number;
}): number {
  const { attacker, defender, killed } = params;
  if (
    !params.attackerWon ||
    !params.fortBreached ||
    params.defenderProtected ||
    attacker.fortLevel < DUNGEON_FORT_LEVEL
  ) {
    return 0;
  }
  attacker.captives ??= [];
  const { captives } = attacker;
  const held = captives.reduce((sum, row) => sum + row.quantity, 0);
  const rows = TRAINED_KEYS.map((key) => Math.max(0, killed[key] ?? 0));
  const take = Math.min(
    captureQuantity(rows.reduce((sum, n) => sum + n, 0)),
    Math.max(0, dungeonCapacity(attacker.fortLevel) - held),
  );
  if (take <= 0) return 0;
  const split = distributeCaptures(rows, take);
  TRAINED_KEYS.forEach((key, index) => {
    if (split[index] > 0) {
      captives.push({
        sourceId: defender.id,
        key,
        quantity: split[index],
        capturedDay: params.day,
      });
    }
  });
  if (attacker.simStats) attacker.simStats.captivesTaken += take;
  return take;
}

/**
 * The daily dungeon step for one captor. A source who can afford it ransoms
 * its troops back at 40% of their cost, half of which the captor keeps.
 * After 72 hours the captor converts the rest at 25% of their cost; captives
 * still held after 7 days escape home as citizens.
 */
export function processCaptives(
  captor: PlayerState,
  players: Map<string, PlayerState>,
  day: number,
): void {
  if (!captor.captives?.length) return;
  const kept: NonNullable<PlayerState['captives']> = [];
  for (const row of captor.captives) {
    const source = players.get(row.sourceId);
    const { type, level } = unitOf(row.key);
    const cost = unitCost(type, level);
    const ransom = row.quantity * Math.ceil(cost * RANSOM_PERCENT);
    if (source && source.gold + source.goldInBank >= ransom * 2) {
      pay(source, ransom);
      source.units[row.key] += row.quantity;
      captor.gold += Math.floor(ransom * RANSOM_CAPTOR_SHARE);
      continue;
    }
    const convert = row.quantity * Math.ceil(cost * CONVERT_COST_PERCENT);
    if (
      (day - row.capturedDay) * 24 >= CONVERT_MIN_HOURS &&
      captor.gold + captor.goldInBank >= convert
    ) {
      pay(captor, convert);
      // A captor at fort 13+ has every unit tier unlocked.
      captor.units[row.key] += row.quantity;
      continue;
    }
    if (day - row.capturedDay >= CAPTIVE_MAX_DAYS) {
      if (source) source.units.citizen += row.quantity;
      continue;
    }
    kept.push(row);
  }
  captor.captives = kept;
}
