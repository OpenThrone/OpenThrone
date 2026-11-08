import type { PlayerRace } from '@/types/typings';
import type { CombatRuleset } from '@/utils/balance/combatRuleset';
import { deepFreeze } from '@/utils/balance/combatRuleset';
import type {
  CombatConstants,
  RaceIdentityModifiers,
} from '@/utils/balance/v5Combat';

import tables from './tables.json';

/**
 * combat-v9 (#202): gear parity, troop-only chip, mercenaries take the front
 * line. This file is a frozen copy: never edit a number here once the version
 * has shipped. A balance change adds a new ruleset built on this one with
 * `deriveCombatRuleset` (see combatRulesets.ts).
 *
 * `tables.json` is the frozen unit, item, upgrade, fort, armory, house and
 * racial-bonus data the engine read when v9 shipped.
 */

const constants: CombatConstants = {
  MAX_ATTACK_TURNS: 10,
  /** Ranged defense supports melee-only attacker assaults; actual ranged pressure retains full matching defense. */
  RANGED_DEFENSE_ASSAULT_WEIGHT: 0.5,
  MORALE_EXHAUSTION_PER_TURN: 0.025,
  MAX_GOLD_PILLAGE_SHARE: 0.22,
  /** All attackers combined may take at most this share of a protected defender's on-hand gold per day; unprotected treasuries have no daily ceiling. */
  DAILY_GOLD_PILLAGE_SHARE_CAP: 0.5,
  /** A standing fort shields the treasury: the loot cap scales from this floor up to the full cap once breached. */
  FORT_LOOT_CAP_FLOOR_SHARE: 0.25,
  /** Loot-cap multiplier on a protected defender's shielded gold at level 1; it tapers linearly to PROTECTED_LOOT_MULTIPLIER_MAX at PROTECTION_TAPER_END_LEVEL. */
  PROTECTED_LOOT_MULTIPLIER: 0.1,
  /** Shield multiplier reached at PROTECTION_TAPER_END_LEVEL (no shielding). */
  PROTECTED_LOOT_MULTIPLIER_MAX: 1,
  /** Level at which the protected-gold shield has fully tapered away. */
  PROTECTION_TAPER_END_LEVEL: 10,
  /** Only this much on-hand gold is shielded for a protected defender; the excess is raided at the normal rate. */
  PROTECTED_GOLD_ALLOWANCE: 100_000,
  /** Share of the exposed (unshielded) gold a protected (level 9 or below) defender still pays out. */
  PROTECTED_LEVEL_LOOT_FACTOR: 0.8,
  DEFENSE_COVERAGE_THRESHOLD: 0.25,
  SINGLE_ATTACK_POPULATION_LOSS_CAP: 0.08,
  /** Default (defender) floor on casualty win quality: a crushed side still pays at least this share of its budget. */
  DEFENDER_WIN_QUALITY_FLOOR: 0.3,
  /** Attacker floor on casualty win quality (issue #200): an anti-farming cost so decisive raids still pay at least half the casualty budget. */
  ATTACKER_WIN_QUALITY_FLOOR: 0.5,
  /** Assault chip damage is zero at or below this attack/defense ratio (issue #200). */
  CHIP_TAPER_START_RATIO: 0.25,
  /**
   * Chip damage on an assault that does not break through scales with the
   * troops' share of attack, so gear decides breakthroughs without adding
   * losses to a defense that holds (#202). Ships with the gear-parity stats.
   */
  CHIP_FROM_TROOPS_ONLY: true,
  /** Assault chip damage reaches its full floor at this attack/defense ratio. */
  CHIP_TAPER_FULL_RATIO: 0.75,
  /** No single battle may destroy more than this many days of rebuild throughput. */
  CASUALTY_BUDGET_RECOVERY_DAYS: 5,
  /** All attackers combined may not destroy more than this many days of throughput per day. */
  DAILY_CASUALTY_RECOVERY_DAYS: 7,
  /**
   * Within a unit type and level, mercenaries absorb losses at this weight
   * over their headcount (2 = twice their share), so hired troops take the
   * front line and a player's own units are spared first.
   */
  MERC_LOSS_WEIGHT: 2,
  /** No single unit stack loses more than this share of its size in one battle. */
  PER_STACK_CASUALTY_CAP: 0.4,
  /** Share of battle casualties that are wounded (recoverable) instead of killed. */
  WOUNDED_SHARE: 0.3,
  /** Fraction of the wounded pool that returns to active duty each day. */
  WOUNDED_HEAL_RATE_DAILY: 0.35,
  BASE_DAILY_SELF_CLICKS: 225,
  BASE_DAILY_RECEIVED_CLICKS: 25,
  SUBSCRIBER_CITIZENS_PER_DAY: 300,
  /** Subscriber growth counts toward casualty budgets only up to this cap. */
  SUBSCRIBER_BUDGET_CITIZENS_PER_DAY_CAP: 60,
  MAX_SPY_MISSION_TURNS: 10,
  MAX_INTEL_TURNS: 5,
  MIN_INFILTRATION_TURNS: 2,
  MIN_ASSASSINATION_TURNS: 3,
  /**
   * Fort walls erode as a share of their maximum hitpoints, never as a flat
   * roll, so a Manor and a Citadel both take several committed assaults to
   * breach. The ratio is attack pressure over manned-wall pressure (defender
   * units plus the fort's own defense power).
   */
  FORT_DAMAGE: {
    /** Share of max HP removed by a marginal successful assault turn. */
    MIN_SHARE_PER_TURN: 0.02,
    /** Share of max HP removed by an overwhelming assault turn. */
    MAX_SHARE_PER_TURN: 0.07,
    /** Pressure ratio at which a turn reaches MAX_SHARE_PER_TURN. */
    OVERWHELM_RATIO: 3,
    /** Repelled assaults at or above this ratio still scorch the walls. */
    CHIP_MIN_RATIO: 0.35,
    /** A repelled assault at ratio 1 deals this share of a marginal success. */
    CHIP_SHARE_OF_SUCCESS: 0.33,
    /** No single battle removes more than this share of max HP. */
    PER_BATTLE_CAP_SHARE: 0.3,
  },
  /** Defender ranged units fire on the attacker's own turn; standing walls steady their aim. */
  RANGED_COUNTER_FORT_BONUS: 0.25,
  /** Protected (level 9 and under) defenders lose at most this share of population per battle. */
  PROTECTED_LOSS_CAP_SHARE: 0.015,
  /** Damage against a protected defender is halved before budgeting (was a floored 10%). */
  PROTECTED_DAMAGE_MULTIPLIER: 0.5,
  /**
   * Assassinations draw from the defender's shared daily casualty allowance
   * (DAILY_CASUALTY_RECOVERY_DAYS of throughput, battles included) and, on top,
   * all attackers together may kill at most this share of the targeted unit
   * type per OT day.
   */
  ASSASSINATION_DAILY_TYPE_SHARE: 0.1,
  /** Spy entry strength blends the dispatched squad with the whole spy network. */
  SPY_SENT_WEIGHT: 0.7,
  SPY_NETWORK_WEIGHT: 0.3,
  /**
   * Each turn of spy pressure a defender absorbed today adds this much phantom
   * sentry strength (a tenth of a level-1 sentry's 5 defence), so pressure bites
   * even with no sentries: a 5-spy intel squad is a coin flip after ~30 turns.
   */
  SPY_PRESSURE_PHANTOM_SENTRY_PER_TURN: 0.5,
  /** Intel missions one attacker may run against one defender per rolling 24h. */
  INTEL_MAX_PER_TARGET_PER_DAY: 5,
};

const DEFAULT_RACE_IDENTITY: RaceIdentityModifiers = {
  offenseMultiplier: 1,
  defenseMultiplier: 1,
  incomeMultiplier: 1,
  intelMultiplier: 1,
  sentryMultiplier: 1,
  rangedDefenseMultiplier: 1,
  citizenRecoveryMultiplier: 1,
  fortRepairCostMultiplier: 1,
  goldPillageMultiplier: 1,
  breachSpySentryCasualtyMultiplier: 1,
};

const RACE_IDENTITY: Record<PlayerRace, RaceIdentityModifiers> = {
  ALL: DEFAULT_RACE_IDENTITY,
  HUMAN: {
    ...DEFAULT_RACE_IDENTITY,
    offenseMultiplier: 1.02,
    defenseMultiplier: 1.02,
    incomeMultiplier: 1.02,
    intelMultiplier: 1.02,
  },
  ELF: {
    ...DEFAULT_RACE_IDENTITY,
    intelMultiplier: 1.05,
    sentryMultiplier: 1.05,
    rangedDefenseMultiplier: 1.04,
    breachSpySentryCasualtyMultiplier: 0.95,
  },
  GOBLIN: {
    ...DEFAULT_RACE_IDENTITY,
    incomeMultiplier: 1.05,
    citizenRecoveryMultiplier: 1.05,
    fortRepairCostMultiplier: 0.95,
    goldPillageMultiplier: 1.03,
  },
  UNDEAD: {
    ...DEFAULT_RACE_IDENTITY,
    resurrection: {
      unlockLevel: 5,
      attackRate: 0.1,
      defenseRate: 0.07,
      maxByLevel: 3,
      maxByUnitPercent: 0.03,
    },
  },
};

export const COMBAT_V9: CombatRuleset = deepFreeze({
  version: 'combat-v9',
  constants,
  battle: {
    MAX_TURNS: constants.MAX_ATTACK_TURNS,
    ATTACKER_DAMAGE_MULTIPLIER: 1,
    DEFENDER_COUNTER_DAMAGE_MULTIPLIER: 1,
    MAX_PILLAGE_SHARE_PER_ATTACK: constants.MAX_GOLD_PILLAGE_SHARE,
    DAMAGE_VARIANCE_MIN: 0.92,
    DAMAGE_VARIANCE_MAX: 1.08,
  },
  race: RACE_IDENTITY,
  ...(tables as unknown as Pick<
    CombatRuleset,
    | 'bonuses'
    | 'levelXp'
    | 'units'
    | 'items'
    | 'battleUpgrades'
    | 'fortifications'
    | 'armoryUpgrades'
    | 'houseUpgrades'
    | 'offensiveUpgrades'
    | 'spyUpgrades'
    | 'sentryUpgrades'
  >),
  defenderFatigue: { perPressure: 0.0025, minMultiplier: 0.85 },
  xpPerTurn: {
    bands: [
      { upToLevel: 10, xp: 360 },
      { upToLevel: 25, xp: 300 },
      { upToLevel: 50, xp: 260 },
      { upToLevel: 75, xp: 230 },
    ],
    beyond: 200,
  },
});
