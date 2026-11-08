import { z } from 'zod';

import { BattleUpgrades } from '@/constants/Battle_Upgrades';
import { DefaultLevelBonus } from '@/constants/Bonuses';
import { ItemTypes } from '@/constants/Items';
import {
  ArmoryUpgrades,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
} from '@/constants/Structure_Upgrades';
import { UnitTypes } from '@/constants/Units';

/** Pure validation and catalog helpers for the admin upgrades editor. */

export const STRUCTURE_TYPES = ['OFFENSE', 'SPY', 'SENTRY', 'ARMORY'] as const;
export const BATTLE_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;
export const BONUS_TYPES = DefaultLevelBonus.map((b) => b.type) as string[];
export const UNIT_TYPES = [
  'CITIZEN',
  'WORKER',
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
] as const;
export const ITEM_TYPES = [
  'WEAPON',
  'HELM',
  'BRACERS',
  'SHIELD',
  'BOOTS',
  'ARMOR',
] as const;
export const ITEM_USAGES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;

export type StructureType = (typeof STRUCTURE_TYPES)[number];
export type BattleType = (typeof BATTLE_TYPES)[number];

/** Matches the cap enforced by AccountService.updateBonusPoints. */
export const BONUS_MAX_LEVEL = 75;
export const QUANTITY_MAX = 2147483647;

// Structure levels are 1-based indexes into each constants table
// (Structure.service), so the max level is the table length.
const maxLevel = (rows: unknown[]) => rows.length;

export const STRUCTURE_MAX_LEVEL: Record<StructureType, number> = {
  OFFENSE: maxLevel(OffensiveUpgrades),
  SPY: maxLevel(SpyUpgrades),
  SENTRY: maxLevel(SentryUpgrades),
  ARMORY: maxLevel(ArmoryUpgrades),
};

export interface CatalogUnit {
  type: string;
  level: number;
  name: string;
}
export interface CatalogItem {
  type: string;
  usage: string;
  level: number;
  name: string;
}
export interface CatalogBattleUpgrade {
  type: string;
  level: number;
  name: string;
}

export const UNIT_CATALOG: CatalogUnit[] = UnitTypes.map((u) => ({
  type: u.type,
  level: u.level,
  name: u.name,
}));

export const ITEM_CATALOG: CatalogItem[] = (() => {
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const item of ItemTypes) {
    const key = `${item.type}_${item.usage}_${item.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: item.type,
      usage: item.usage,
      level: item.level,
      name: item.name,
    });
  }
  return out;
})();

export const BATTLE_UPGRADE_CATALOG: CatalogBattleUpgrade[] =
  BattleUpgrades.map((u) => ({ type: u.type, level: u.level, name: u.name }));

export const unitKey = (u: { type?: string; level?: number }) =>
  `${u.type}_${u.level}`;
export const itemKey = (i: { type?: string; usage?: string; level?: number }) =>
  `${i.type}_${i.usage}_${i.level}`;
export const battleKey = (b: { type?: string; level?: number }) =>
  `${b.type}_${b.level}`;

/** Catalog units the player has no non-mercenary row for. */
export function missingUnits(
  owned: { type: string; level: number; isMercenary?: boolean }[],
): CatalogUnit[] {
  const have = new Set(owned.filter((u) => !u.isMercenary).map(unitKey));
  return UNIT_CATALOG.filter((u) => !have.has(unitKey(u)));
}

/** Catalog items the player has no row for. */
export function missingItems(
  owned: { type: string; usage: string; level: number }[],
): CatalogItem[] {
  const have = new Set(owned.map(itemKey));
  return ITEM_CATALOG.filter((i) => !have.has(itemKey(i)));
}

/**
 * Ledger deltas for adding items. The add leaves an existing row alone, so
 * only a key the player had no row for changes a balance.
 */
export function grantedItemDeltas<
  T extends { type: string; usage: string; level: number; quantity: number },
>(added: T[], owned: { type: string; usage: string; level: number }[]) {
  const have = new Set(owned.map(itemKey));
  return added
    .filter((item) => !have.has(itemKey(item)))
    .map(({ type, usage, level, quantity }) => ({
      type,
      usage,
      level,
      delta: quantity,
    }));
}

const Quantity = z.number().int().min(0).max(QUANTITY_MAX);

const ExpectedValue = z.number().int().nullable();

/**
 * Loaded values the edit was based on, keyed like the stale check below.
 * `null` means the row did not exist. Added units/items must expect `null`.
 */
const ExpectedSchema = z.object({
  eraId: z.number().int().nullable(),
  structure: z.record(z.string(), ExpectedValue).default({}),
  battle: z.record(z.string(), ExpectedValue).default({}),
  bonus: z.record(z.string(), ExpectedValue).default({}),
  units: z.record(z.string(), z.null()).default({}),
  items: z.record(z.string(), z.null()).default({}),
});

export const AdminUpgradesUpdateSchema = z.object({
  structureUpgrades: z
    .array(
      z.object({
        type: z.enum(STRUCTURE_TYPES),
        level: z.number().int().min(1),
      }),
    )
    .max(STRUCTURE_TYPES.length)
    .default([]),
  battleUpgrades: z
    .array(
      z.object({
        type: z.enum(BATTLE_TYPES),
        level: z.number().int().min(1),
        quantity: Quantity,
      }),
    )
    .max(100)
    .default([]),
  bonusPoints: z
    .array(
      z.object({
        type: z.string(),
        level: z.number().int().min(0).max(BONUS_MAX_LEVEL),
      }),
    )
    .max(20)
    .default([]),
  addUnits: z
    .array(
      z.object({
        type: z.enum(UNIT_TYPES),
        level: z.number().int().min(1),
        quantity: Quantity,
      }),
    )
    .max(100)
    .default([]),
  addItems: z
    .array(
      z.object({
        type: z.enum(ITEM_TYPES),
        usage: z.enum(ITEM_USAGES),
        level: z.number().int().min(1),
        quantity: Quantity,
      }),
    )
    .max(200)
    .default([]),
  expected: ExpectedSchema,
});

export type AdminUpgradesUpdate = z.infer<typeof AdminUpgradesUpdateSchema>;

const hasDuplicates = (keys: string[]) => new Set(keys).size !== keys.length;

/**
 * Checks an update against game constants and the bonus-point budget.
 * `playerLevel` is the player's level; each level grants one proficiency
 * point (UserStatsService.getAvailableProficiencyPoints), so the summed bonus
 * levels after the edit may not exceed it.
 * `currentBonus` fills in bonus types the update leaves untouched.
 */
export function validateUpgradesUpdate(
  update: AdminUpgradesUpdate,
  playerLevel: number,
  currentBonus: { type: string; level: number }[] = [],
): string[] {
  const errors: string[] = [];

  for (const s of update.structureUpgrades) {
    if (s.level > STRUCTURE_MAX_LEVEL[s.type]) {
      errors.push(
        `Structure ${s.type} level ${s.level} exceeds max ${STRUCTURE_MAX_LEVEL[s.type]}`,
      );
    }
  }
  if (hasDuplicates(update.structureUpgrades.map((s) => s.type))) {
    errors.push('Duplicate structure upgrade types');
  }

  const battleValid = new Set(BATTLE_UPGRADE_CATALOG.map(battleKey));
  for (const b of update.battleUpgrades) {
    if (!battleValid.has(battleKey(b))) {
      errors.push(`Unknown battle upgrade ${battleKey(b)}`);
    }
  }
  if (hasDuplicates(update.battleUpgrades.map(battleKey))) {
    errors.push('Duplicate battle upgrades');
  }

  for (const bp of update.bonusPoints) {
    if (!BONUS_TYPES.includes(bp.type)) {
      errors.push(`Unknown bonus type ${bp.type}`);
    }
  }
  if (hasDuplicates(update.bonusPoints.map((bp) => bp.type))) {
    errors.push('Duplicate bonus point types');
  }
  if (update.bonusPoints.length > 0) {
    const merged = new Map(currentBonus.map((bp) => [bp.type, bp.level]));
    for (const bp of update.bonusPoints) merged.set(bp.type, bp.level);
    const total = Array.from(merged.values()).reduce(
      (sum, level) => sum + (level || 0),
      0,
    );
    if (total > playerLevel) {
      errors.push(
        `Bonus points total ${total} exceeds the ${playerLevel} available at level ${playerLevel}`,
      );
    }
  }

  const unitValid = new Set(UNIT_CATALOG.map(unitKey));
  for (const u of update.addUnits) {
    if (!unitValid.has(unitKey(u))) {
      errors.push(`Unknown unit ${unitKey(u)}`);
    }
  }
  if (hasDuplicates(update.addUnits.map(unitKey))) {
    errors.push('Duplicate units');
  }

  const itemValid = new Set(ITEM_CATALOG.map(itemKey));
  for (const i of update.addItems) {
    if (!itemValid.has(itemKey(i))) {
      errors.push(`Unknown item ${itemKey(i)}`);
    }
  }
  if (hasDuplicates(update.addItems.map(itemKey))) {
    errors.push('Duplicate items');
  }

  return errors;
}

/** Before/after pairs for keys whose value changed. */
export function diffByKey<T>(
  before: T[],
  after: T[],
  key: (row: T) => string,
  value: (row: T) => number,
): Record<string, { before: number | null; after: number | null }> {
  const b = new Map(before.map((r) => [key(r), value(r)]));
  const a = new Map(after.map((r) => [key(r), value(r)]));
  const out: Record<string, { before: number | null; after: number | null }> =
    {};
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    const bv = b.get(k) ?? null;
    const av = a.get(k) ?? null;
    if (bv !== av) out[k] = { before: bv, after: av };
  }
  return out;
}

export const STALE_UPGRADES_MESSAGE =
  'This player changed since you opened the editor. Reload to see current values.';

/** Current DB values in the same shape as `expected`. */
export interface UpgradesSnapshot {
  eraId: number | null;
  structure: Record<string, number>;
  battle: Record<string, number>;
  bonus: Record<string, number>;
  units: Set<string>;
  items: Set<string>;
}

export function snapshotUpgrades(row: {
  currentEraId?: number | null;
  UserStructureUpgrade: { type: string; level: number }[];
  UserBattleUpgrade: { type: string; level: number; quantity: number }[];
  UserBonusPoints: { type: string; level: number }[];
  UserUnit: { type: string; level: number; isMercenary: boolean }[];
  UserItem: { type: string; usage: string; level: number }[];
}): UpgradesSnapshot {
  return {
    eraId: row.currentEraId ?? null,
    structure: Object.fromEntries(
      row.UserStructureUpgrade.map((r) => [r.type, r.level]),
    ),
    battle: Object.fromEntries(
      row.UserBattleUpgrade.map((r) => [battleKey(r), r.quantity]),
    ),
    bonus: Object.fromEntries(
      row.UserBonusPoints.map((r) => [r.type, r.level]),
    ),
    units: new Set(row.UserUnit.filter((u) => !u.isMercenary).map(unitKey)),
    items: new Set(row.UserItem.map(itemKey)),
  };
}

/** Supplied rows that carry no expectation; any entry means a 422. */
export function findMissingExpectations(update: AdminUpgradesUpdate): string[] {
  const { expected } = update;
  const missing: string[] = [];
  const check = (
    bucket: Record<string, unknown>,
    key: string,
    label: string,
  ) => {
    if (!(key in bucket)) missing.push(`${label} ${key}`);
  };
  update.structureUpgrades.forEach((r) =>
    check(expected.structure, r.type, 'structure'),
  );
  update.battleUpgrades.forEach((r) =>
    check(expected.battle, battleKey(r), 'battle'),
  );
  update.bonusPoints.forEach((r) => check(expected.bonus, r.type, 'bonus'));
  update.addUnits.forEach((r) => check(expected.units, unitKey(r), 'unit'));
  update.addItems.forEach((r) => check(expected.items, itemKey(r), 'item'));
  return missing;
}

/** Expectations that no longer match the locked row; any entry means a 409. */
export function findStaleUpgrades(
  expected: AdminUpgradesUpdate['expected'],
  current: UpgradesSnapshot,
): string[] {
  const stale: string[] = [];
  if (expected.eraId !== current.eraId) stale.push('currentEraId');
  const compare = (
    bucket: Record<string, number | null>,
    now: Record<string, number>,
    label: string,
  ) => {
    for (const [key, value] of Object.entries(bucket)) {
      if ((now[key] ?? null) !== value) stale.push(`${label} ${key}`);
    }
  };
  compare(expected.structure, current.structure, 'structure');
  compare(expected.battle, current.battle, 'battle');
  compare(expected.bonus, current.bonus, 'bonus');
  for (const key of Object.keys(expected.units)) {
    if (current.units.has(key)) stale.push(`unit ${key}`);
  }
  for (const key of Object.keys(expected.items)) {
    if (current.items.has(key)) stale.push(`item ${key}`);
  }
  return stale;
}

/** Editable values, keyed as in UpgradesSnapshot; absent means no row. */
export interface UpgradesEditState {
  structure: Record<string, number>;
  battle: Record<string, number>;
  bonus: Record<string, number>;
}

/**
 * Client-side patch: only rows whose edited value differs from the loaded
 * one, each with its loaded value (null when the row was absent).
 * `defaults` gives the value shown for an absent row, so leaving it untouched
 * sends nothing.
 */
export function buildUpgradesPatch(
  loaded: UpgradesEditState,
  edited: UpgradesEditState,
  defaults: { structure: number; battle: number; bonus: number },
  eraId: number | null,
  addUnits: { type: string; level: number; quantity: number }[],
  addItems: { type: string; usage: string; level: number; quantity: number }[],
) {
  const changed = (
    bucket: 'structure' | 'battle' | 'bonus',
  ): [string, number, number | null][] =>
    Object.entries(edited[bucket])
      .filter(
        ([key, value]) => value !== (loaded[bucket][key] ?? defaults[bucket]),
      )
      .map(([key, value]) => [key, value, loaded[bucket][key] ?? null]);
  const split = (key: string) => {
    const at = key.lastIndexOf('_');
    return { type: key.slice(0, at), level: Number(key.slice(at + 1)) };
  };
  const structure = changed('structure');
  const battle = changed('battle');
  const bonus = changed('bonus');
  return {
    structureUpgrades: structure.map(([type, level]) => ({ type, level })),
    battleUpgrades: battle.map(([key, quantity]) => ({
      ...split(key),
      quantity,
    })),
    bonusPoints: bonus.map(([type, level]) => ({ type, level })),
    addUnits,
    addItems,
    expected: {
      eraId,
      structure: Object.fromEntries(structure.map(([k, , was]) => [k, was])),
      battle: Object.fromEntries(battle.map(([k, , was]) => [k, was])),
      bonus: Object.fromEntries(bonus.map(([k, , was]) => [k, was])),
      units: Object.fromEntries(addUnits.map((u) => [unitKey(u), null])),
      items: Object.fromEntries(addItems.map((i) => [itemKey(i), null])),
    },
  };
}
