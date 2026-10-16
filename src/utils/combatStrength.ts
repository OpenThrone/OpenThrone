import { BattleUpgrades, ItemTypes, UnitTypes } from '@/constants';
import type { BattleFormation, PerUnitCombatStats } from '@/types/combat';
import type { UnitType } from '@/types/typings';

import { getRaceIdentity } from './balance/v5Combat';

interface CombatStrengthUnit {
  type: string;
  level: number;
  quantity: number;
  isMercenary?: boolean;
  currentHP?: number;
}

export interface CombatStrengthUser {
  units?: readonly CombatStrengthUnit[];
  mercenaries?: readonly CombatStrengthUnit[];
  items?: readonly {
    usage: string;
    type: string;
    level: number;
    quantity: number;
  }[];
  battle_upgrades?: readonly {
    type: string;
    level: number;
    quantity: number;
  }[];
  structure_upgrades?: readonly { type: string; level: number }[];
  fortLevel?: number;
  race?: string;
  attackBonus?: number;
  defenseBonus?: number;
  spyBonus?: number;
  sentryBonus?: number;
}

export interface CombatStrengthOptions {
  multiplier?: number;
  unitLevels?: readonly number[];
  limit?: number;
  collateralFallback?: boolean;
}

type CalculatedStrength = PerUnitCombatStats;

export interface DetailedCalculatedStrength {
  baseStats: CalculatedStrength;
  itemStats: CalculatedStrength;
  upgradeStats: CalculatedStrength;
  totalStats: CalculatedStrength;
}

const STAT_KEYS = [
  'MeleeAtkPower',
  'MeleeDefPower',
  'RangedAtkPower',
  'RangedDefPower',
] as const;
const ITEM_SLOTS = [
  'WEAPON',
  'HELM',
  'ARMOR',
  'BOOTS',
  'BRACERS',
  'SHIELD',
] as const;

function zeroStats(): CalculatedStrength {
  return {
    MeleeAtkPower: 0,
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  };
}

function quantity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function statsOf(value: Partial<CalculatedStrength>): CalculatedStrength {
  const stats = zeroStats();
  for (const key of STAT_KEYS)
    stats[key] = Number.isFinite(value[key]) ? Math.max(0, value[key] ?? 0) : 0;
  return stats;
}

function roleMultiplier(user: CombatStrengthUser, type: UnitType): number {
  const race = getRaceIdentity(user.race);
  switch (type) {
    case 'OFFENSE':
      return (1 + (user.attackBonus ?? 0) / 100) * race.offenseMultiplier;
    case 'DEFENSE':
      return (1 + (user.defenseBonus ?? 0) / 100) * race.defenseMultiplier;
    case 'SPY':
      return (1 + (user.spyBonus ?? 0) / 100) * race.intelMultiplier;
    case 'SENTRY':
      return (
        (1 + (user.sentryBonus ?? 0) / 100) *
        race.sentryMultiplier *
        race.rangedDefenseMultiplier
      );
    default:
      return 1;
  }
}

interface Allocation extends BattleFormation {
  baseStats: CalculatedStrength;
  itemStats: CalculatedStrength;
  upgradeStats: CalculatedStrength;
  equippedSlots: Set<string>;
}

function splitCovered(
  groups: Allocation[],
  index: number,
  covered: number,
): Allocation {
  const group = groups[index]!;
  if (covered < group.quantity) {
    groups.splice(index + 1, 0, {
      ...group,
      quantity: group.quantity - covered,
      baseStats: { ...group.baseStats },
      itemStats: { ...group.itemStats },
      upgradeStats: { ...group.upgradeStats },
      perUnitStats: { ...group.perUnitStats },
      equippedSlots: new Set(group.equippedSlots),
    });
    group.quantity = covered;
  }
  return group;
}

/** Allocate owned capacity once, strongest tier first and regular units before mercenaries.
 * Coalescing rows before allocation makes both row order and row splitting irrelevant.
 * Covered/uncovered groups preserve fractional per-unit bonuses without rounding inflation.
 */
function allocate(
  user: CombatStrengthUser,
  type: UnitType,
  options: CombatStrengthOptions,
): Allocation[] {
  const roster = new Map<string, CombatStrengthUnit>();
  const partial: CombatStrengthUnit[] = [];
  const add = (unit: CombatStrengthUnit, mercenary: boolean) => {
    if (
      unit.type !== type ||
      (options.unitLevels && !options.unitLevels.includes(unit.level))
    )
      return;
    const info = UnitTypes.find(
      (entry) => entry.type === unit.type && entry.level === unit.level,
    );
    if (
      !info ||
      (user.fortLevel !== undefined &&
        user.fortLevel < info.fortLevel &&
        type !== 'CITIZEN' &&
        type !== 'WORKER')
    )
      return;
    let count = quantity(unit.quantity);
    if (!count) return;
    const isMercenary = mercenary || unit.isMercenary === true;
    if (unit.currentHP !== undefined && unit.currentHP < info.hp) {
      partial.push({
        type: unit.type,
        level: unit.level,
        quantity: 1,
        isMercenary,
        currentHP: Math.max(0, unit.currentHP),
      });
      count--;
    }
    const key = `${unit.type}:${unit.level}:${isMercenary}`;
    const existing = roster.get(key);
    if (existing) existing.quantity += count;
    else if (count)
      roster.set(key, {
        type: unit.type,
        level: unit.level,
        quantity: count,
        isMercenary,
        currentHP: info.hp,
      });
  };
  for (const unit of user.units ?? []) add(unit, false);
  for (const unit of user.mercenaries ?? []) add(unit, true);
  let remaining =
    options.limit === undefined ? Infinity : quantity(options.limit);
  const groups: Allocation[] = [];
  const sorted = [...roster.values(), ...partial].sort(
    (a, b) =>
      b.level - a.level ||
      Number(a.isMercenary) - Number(b.isMercenary) ||
      (b.currentHP ?? 0) - (a.currentHP ?? 0) ||
      a.type.localeCompare(b.type),
  );
  for (const unit of sorted) {
    const count = Math.min(unit.quantity, remaining);
    if (!count) continue;
    remaining -= count;
    const info = UnitTypes.find(
      (entry) => entry.type === unit.type && entry.level === unit.level,
    )!;
    const baseStats = statsOf(info);
    groups.push({
      type: unit.type,
      level: unit.level,
      quantity: count,
      isMercenary: unit.isMercenary === true,
      combatRole:
        type === 'CITIZEN' || type === 'WORKER'
          ? 'COLLATERAL'
          : baseStats.RangedAtkPower > 0
            ? 'RANGED'
            : 'MELEE',
      maxHP: info.hp,
      currentHP: unit.currentHP ?? info.hp,
      baseStats,
      itemStats: zeroStats(),
      upgradeStats: zeroStats(),
      perUnitStats: zeroStats(),
      equippedSlots: new Set(),
    });
  }

  const inventory = new Map<string, number>();
  for (const item of user.items ?? []) {
    if (item.usage !== type) continue;
    const key = `${item.type}:${item.level}`;
    inventory.set(key, (inventory.get(key) ?? 0) + quantity(item.quantity));
  }
  const armoryLevel =
    user.structure_upgrades?.find((upgrade) => upgrade.type === 'ARMORY')
      ?.level ?? 1;
  for (const slot of ITEM_SLOTS) {
    const items = ItemTypes.filter(
      (item) =>
        item.usage === type &&
        item.type === slot &&
        (item.armoryLevel ?? 0) <= armoryLevel,
    ).sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
    for (const item of items) {
      let available = inventory.get(`${item.type}:${item.level}`) ?? 0;
      for (let index = 0; available > 0 && index < groups.length; index++) {
        const candidate = groups[index]!;
        if (candidate.level < item.level || candidate.equippedSlots.has(slot))
          continue;
        const covered = Math.min(candidate.quantity, available);
        const group = splitCovered(groups, index, covered);
        for (const key of STAT_KEYS) group.itemStats[key] += item[key] ?? 0;
        group.equippedSlots.add(slot);
        if (slot === 'WEAPON' && (item.RangedAtkPower ?? 0) > 0)
          group.combatRole = 'RANGED';
        available -= covered;
      }
    }
  }

  const upgradeInventory = new Map<number, number>();
  for (const upgrade of user.battle_upgrades ?? []) {
    if (upgrade.type === type)
      upgradeInventory.set(
        upgrade.level,
        (upgradeInventory.get(upgrade.level) ?? 0) + quantity(upgrade.quantity),
      );
  }
  const siegeLevel =
    user.structure_upgrades?.find((upgrade) => upgrade.type === 'OFFENSE')
      ?.level ?? 0;
  const upgrades = BattleUpgrades.filter(
    (upgrade) =>
      upgrade.type === type && (upgrade.SiegeUpgradeLevel ?? 0) <= siegeLevel,
  ).sort((a, b) => b.level - a.level);
  for (const upgrade of upgrades) {
    const coverage = upgrade.unitsCovered || 1;
    let available = (upgradeInventory.get(upgrade.level) ?? 0) * coverage;
    for (let index = 0; available > 0 && index < groups.length; index++) {
      const candidate = groups[index]!;
      if (candidate.level < (upgrade.minUnitLevel ?? 0)) continue;
      const covered = Math.min(candidate.quantity, available);
      const group = splitCovered(groups, index, covered);
      for (const key of STAT_KEYS)
        group.upgradeStats[key] += (upgrade[key] ?? 0) / coverage;
      available -= covered;
    }
  }

  const requestedMultiplier = options.multiplier ?? roleMultiplier(user, type);
  const multiplier = Number.isFinite(requestedMultiplier)
    ? Math.max(0, requestedMultiplier)
    : 0;
  for (const group of groups) {
    for (const key of STAT_KEYS)
      group.perUnitStats[key] =
        (group.baseStats[key] +
          group.itemStats[key] +
          group.upgradeStats[key]) *
        multiplier;
  }
  if (
    !groups.length &&
    options.collateralFallback &&
    options.limit !== 0 &&
    !options.unitLevels &&
    (type === 'DEFENSE' || type === 'SENTRY')
  ) {
    for (const civilianType of ['CITIZEN', 'WORKER'] as const) {
      const civilianGroups = allocate(user, civilianType, { multiplier });
      for (const group of civilianGroups) {
        for (const key of STAT_KEYS) {
          group.baseStats[key] *= 0.1;
          group.itemStats[key] *= 0.1;
          group.upgradeStats[key] *= 0.1;
          group.perUnitStats[key] *= 0.1;
        }
        group.baseStats.MeleeAtkPower = 0;
        group.baseStats.RangedAtkPower = 0;
        group.perUnitStats.MeleeAtkPower = 0;
        group.perUnitStats.RangedAtkPower = 0;
      }
      groups.push(...civilianGroups);
    }
  }
  return groups;
}

export function buildCombatFormations(
  user: CombatStrengthUser,
  unitType: UnitType,
  options: CombatStrengthOptions = {},
): BattleFormation[] {
  return allocate(user, unitType, options).map(
    ({
      baseStats: _base,
      itemStats: _items,
      upgradeStats: _upgrades,
      equippedSlots: _slots,
      ...formation
    }) => formation,
  );
}

export function calculateCombatStrength(
  user: CombatStrengthUser,
  unitType: UnitType,
  options: CombatStrengthOptions = {},
): DetailedCalculatedStrength {
  const result: DetailedCalculatedStrength = {
    baseStats: zeroStats(),
    itemStats: zeroStats(),
    upgradeStats: zeroStats(),
    totalStats: zeroStats(),
  };
  for (const group of allocate(user, unitType, options)) {
    for (const key of STAT_KEYS) {
      result.baseStats[key] += group.baseStats[key] * group.quantity;
      result.itemStats[key] += group.itemStats[key] * group.quantity;
      result.upgradeStats[key] += group.upgradeStats[key] * group.quantity;
      result.totalStats[key] += group.perUnitStats[key] * group.quantity;
    }
  }
  // Public army totals are integral; never round a per-unit average or each input row.
  for (const key of STAT_KEYS)
    result.totalStats[key] = Math.ceil(result.totalStats[key]);
  return result;
}
