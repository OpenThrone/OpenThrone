import type {
  BonusType,
  ItemType,
  PlayerClass,
  PlayerRace,
  UnitType,
} from '@/types/typings';

import type { CombatConstants, RaceIdentityModifiers } from './v5Combat';

/**
 * A CombatRuleset is everything the battle engine reads to turn two armies
 * into a result, frozen per formula version. The engine takes one as a
 * parameter, so a battle sealed under `combat-vN` replays under the numbers
 * and switches it was fought with, whatever the live game has become since.
 */

interface PowerStats {
  MeleeAtkPower?: number;
  MeleeDefPower?: number;
  RangedAtkPower?: number;
  RangedDefPower?: number;
}

export interface RulesetUnit extends PowerStats {
  type: UnitType;
  level: number;
  hp: number;
  /** Replacement cost; prices the losses in the canonical outcome. */
  cost: number;
  /** Fort level that unlocks the unit for combat. */
  fortLevel: number;
}

export interface RulesetItem extends PowerStats {
  id: string;
  usage: UnitType;
  type: ItemType;
  level: number;
  armoryLevel: number;
}

export interface RulesetBattleUpgrade extends PowerStats {
  type: UnitType;
  level: number;
  SiegeUpgradeLevel: number;
  minUnitLevel: number;
  unitsCovered: number;
}

export interface RulesetFortification {
  level: number;
  hitpoints: number;
  costPerRepairPoint: number;
  casualtyMitigation: number;
  MeleeDefPower: number;
  RangedDefPower: number;
  defenseBonusPercentage: number;
}

export interface RulesetBonus {
  race: PlayerRace | PlayerClass;
  bonusType: BonusType;
  bonusAmount: number;
}

/** The live battle knobs the admin simulator may override on the current ruleset. */
export interface BattleTuning {
  MAX_TURNS: number;
  ATTACKER_DAMAGE_MULTIPLIER: number;
  DEFENDER_COUNTER_DAMAGE_MULTIPLIER: number;
  MAX_PILLAGE_SHARE_PER_ATTACK: number;
  DAMAGE_VARIANCE_MIN: number;
  DAMAGE_VARIANCE_MAX: number;
}

export interface CombatRuleset {
  /** The formula version sealed into every replay fought under this ruleset. */
  readonly version: string;
  /** Combat constants and casualty budgets, wounded share, mercenary loss weight, troop-only chip. */
  readonly constants: CombatConstants;
  readonly battle: BattleTuning;
  /**
   * Spread casualties across unit tiers by headcount instead of consuming the
   * lowest level first (#203). Per-battle totals stay those of the lowest-first
   * engine; see `utils/casualtySpread.ts`. Absent means lowest-first.
   */
  readonly casualtySpread?: boolean;
  readonly race: Readonly<Record<PlayerRace, RaceIdentityModifiers>>;
  /** Racial and class bonuses (attack, defense and casualty). */
  readonly bonuses: readonly RulesetBonus[];
  /** XP needed to reach each level; players' levels in a replay derive from it. */
  readonly levelXp: readonly { level: number; xp: number }[];
  readonly units: readonly RulesetUnit[];
  readonly items: readonly RulesetItem[];
  readonly battleUpgrades: readonly RulesetBattleUpgrade[];
  readonly fortifications: readonly RulesetFortification[];
  readonly armoryUpgrades: readonly {
    level: number;
    casualtyMitigationPercentage: number;
  }[];
  /** Indexed by house level. */
  readonly houseUpgrades: readonly { citizensDaily: number }[];
  readonly offensiveUpgrades: readonly {
    level: number;
    offenseBonusPercentage: number;
  }[];
  readonly spyUpgrades: readonly {
    level: number;
    offenseBonusPercentage: number;
    maxInfiltratorsPerMission?: number;
    maxAssassinsPerMission?: number;
  }[];
  /** In level order: sentry level N reads entry N - 1. */
  readonly sentryUpgrades: readonly {
    level: number;
    defenseBonusPercentage: number;
  }[];
  /** Garrison fatigue from defense pressure taken today. */
  readonly defenderFatigue: {
    perPressure: number;
    minMultiplier: number;
  };
  /** Battle XP per committed turn by attacker level; `beyond` applies above the last band. */
  readonly xpPerTurn: {
    bands: readonly { upToLevel: number; xp: number }[];
    beyond: number;
  };
}

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Changes a new ruleset makes to the one it is built on; arrays replace whole. */
export type CombatRulesetOverrides = DeepPartial<
  Omit<CombatRuleset, 'version'>
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeSection(base: unknown, overrides: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) merged[key] = mergeSection(base[key], value);
  }
  return merged;
}

/** Freezes a ruleset and everything under it so a shipped version cannot drift. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Builds the next ruleset as the previous one plus overrides. Objects merge
 * key by key; arrays (unit, item and fort tables) are replaced whole. The base
 * is left untouched, so earlier versions keep replaying exactly.
 */
export function deriveCombatRuleset(
  base: CombatRuleset,
  version: string,
  overrides: CombatRulesetOverrides,
): CombatRuleset {
  return deepFreeze({
    ...(mergeSection(base, overrides) as CombatRuleset),
    version,
  });
}
