import type { BonusType, PlayerRace } from '@/types/typings';

export const V5_COMBAT_CONSTANTS = {
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
  /** No single battle may destroy more than this many days of rebuild throughput. */
  CASUALTY_BUDGET_RECOVERY_DAYS: 5,
  /** All attackers combined may not destroy more than this many days of throughput per day. */
  DAILY_CASUALTY_RECOVERY_DAYS: 7,
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
} as const;

/** Defines the race identity modifiers shape used by related workflows. */
export type RaceIdentityModifiers = {
  offenseMultiplier: number;
  defenseMultiplier: number;
  incomeMultiplier: number;
  intelMultiplier: number;
  sentryMultiplier: number;
  rangedDefenseMultiplier: number;
  citizenRecoveryMultiplier: number;
  fortRepairCostMultiplier: number;
  goldPillageMultiplier: number;
  moraleLossMultiplier: number;
  breachSpySentryCasualtyMultiplier: number;
  resurrection?: {
    unlockLevel: number;
    attackRate: number;
    defenseRate: number;
    maxByLevel: number;
    maxByUnitPercent: number;
  };
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
  moraleLossMultiplier: 1,
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
    moraleLossMultiplier: 0.95,
    resurrection: {
      unlockLevel: 5,
      attackRate: 0.1,
      defenseRate: 0.07,
      maxByLevel: 3,
      maxByUnitPercent: 0.03,
    },
  },
};

const KNOWN_RACES = new Set(['HUMAN', 'ELF', 'GOBLIN', 'UNDEAD', 'ALL']);

/**
 * Restricts a numeric value to the inclusive minimum and maximum combat bounds.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRace(race: unknown): PlayerRace {
  const normalized = String(race ?? '').toUpperCase();
  return KNOWN_RACES.has(normalized) ? (normalized as PlayerRace) : 'HUMAN';
}

/**
 * Resolves combat identity multipliers for a known race, falling back to human defaults.
 */
export function getRaceIdentity(race: unknown): RaceIdentityModifiers {
  return RACE_IDENTITY[normalizeRace(race)] ?? DEFAULT_RACE_IDENTITY;
}

/**
 * Calculates the diminishing-return multiplier granted by invested bonus-point levels.
 */
export function calculateBonusPointMultiplier(level: number): number {
  const safeLevel = Math.max(0, Number(level) || 0);
  return 1 + 0.35 * (safeLevel / (safeLevel + 250));
}

/**
 * Sums all bonus-point levels matching the requested bonus type.
 */
export function getBonusPointLevel(
  bonusPoints: Array<{ type?: string; level?: number }> | undefined,
  type: BonusType,
): number {
  if (!Array.isArray(bonusPoints)) return 0;
  return bonusPoints
    .filter((bonus) => String(bonus?.type ?? '').toUpperCase() === type)
    .reduce((sum, bonus) => sum + Math.max(0, Number(bonus?.level ?? 0)), 0);
}

/**
 * Calculates the gold reward scaling applied for the number of attack turns spent.
 */
export function calculateGoldRewardMultiplier(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS) ** 0.55;
}

function calculateEffectiveMorale(morale: number, turns: number): number {
  const current = clamp((Number(morale) || 0) / 100, 0, 1);
  return clamp(
    current - V5_COMBAT_CONSTANTS.MORALE_EXHAUSTION_PER_TURN * turns,
    0,
    1,
  );
}

/**
 * Calculates the XP factor after morale exhaustion from committed attack turns.
 */
export function calculateMoraleXpFactor(morale: number, turns: number): number {
  return clamp(calculateEffectiveMorale(morale, turns), 0.25, 1);
}

/**
 * Calculates the gold modifier caused by the attacker/defender level gap.
 */
export function calculateGoldLevelModifier(levelDifference: number): number {
  return clamp(1 + levelDifference * 0.05, 0.7, 1.25);
}

/**
 * Rewards closer battles by converting the final win ratio into a bounded multiplier.
 */
export function calculateBattleCloseness(winRatio: number): number {
  return clamp(1.25 - Math.abs(1 - winRatio), 0.5, 1.25);
}

/**
 * Calculates how much of the defender population is covered by defensive units.
 */
export function calculateDefenseCoverage(params: {
  defenseUnits: number;
  totalPopulation: number;
}): number {
  return clamp(params.defenseUnits / Math.max(1, params.totalPopulation), 0, 1);
}

/**
 * Increases fort damage and rewards when a defender is below the coverage threshold.
 */
export function calculateUnderDefendedMultipliers(defenseCoverage: number): {
  fortDamageMultiplier: number;
  rewardMultiplier: number;
} {
  const threshold = V5_COMBAT_CONSTANTS.DEFENSE_COVERAGE_THRESHOLD;
  if (defenseCoverage >= threshold) {
    return { fortDamageMultiplier: 1, rewardMultiplier: 1 };
  }
  const deficit = (threshold - defenseCoverage) / threshold;
  return {
    fortDamageMultiplier: 1 + deficit * 0.25,
    rewardMultiplier: 1 + deficit * 0.25,
  };
}

function calculatePressureProtection(defensePressureToday: number): number {
  return 1 / (1 + Math.max(0, Number(defensePressureToday) || 0) / 20);
}

/**
 * Converts recent defensive spy pressure into protection against repeated spy missions.
 */
export function calculateSpyPressureProtection(
  spyPressureToday: number,
): number {
  return 1 / (1 + Math.max(0, Number(spyPressureToday) || 0) / 16);
}

function calculateTurnDamageFactor(turns: number): number {
  return 0.08 * clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS) ** 1.15;
}

/**
 * Capacity-based daily unit replacement throughput: full click capacity plus
 * housing output (and a bounded subscriber contribution). Anchors casualty
 * budgets so losses stay proportional to what a player can actually rebuild.
 */
/**
 * Defender casualty budget left for the OT day across all attackers. Battles
 * and assassinations both draw from it, so gameplay and simulation share one rule.
 */
export function calculateDefenderDailyCasualtyRemaining(params: {
  dailyThroughput: number;
  casualtiesToday: number;
}): number {
  return Math.max(
    0,
    Math.floor(
      params.dailyThroughput * V5_COMBAT_CONSTANTS.DAILY_CASUALTY_RECOVERY_DAYS,
    ) - Math.max(0, params.casualtiesToday),
  );
}

/**
 * Gold all attackers may still take from a defender today. A protected
 * defender's ceiling is anchored to the start-of-day balance (gold on hand plus
 * gold already taken), so earlier raids do not shrink it. An unprotected
 * defender has no daily ceiling: sustained raiding may take everything on hand.
 */
export function calculateDefenderDailyGoldRemaining(params: {
  goldOnHand: bigint;
  goldTakenToday: bigint;
  isDefenderProtected?: boolean;
}): bigint {
  if (params.isDefenderProtected === false) {
    return params.goldOnHand > 0n ? params.goldOnHand : 0n;
  }
  const ceiling =
    ((params.goldOnHand + params.goldTakenToday) *
      BigInt(
        Math.floor(V5_COMBAT_CONSTANTS.DAILY_GOLD_PILLAGE_SHARE_CAP * 100),
      )) /
    BigInt(100);
  return ceiling > params.goldTakenToday ? ceiling - params.goldTakenToday : 0n;
}

export function calculateDailyReplacementThroughput(params: {
  houseCitizens: number;
  isSubscriber?: boolean;
  race?: unknown;
}): number {
  const subscriberBudgetCitizens = params.isSubscriber
    ? Math.min(
        V5_COMBAT_CONSTANTS.SUBSCRIBER_BUDGET_CITIZENS_PER_DAY_CAP,
        V5_COMBAT_CONSTANTS.SUBSCRIBER_CITIZENS_PER_DAY * 0.6,
      )
    : 0;

  return (
    (V5_COMBAT_CONSTANTS.BASE_DAILY_SELF_CLICKS +
      V5_COMBAT_CONSTANTS.BASE_DAILY_RECEIVED_CLICKS +
      Math.max(0, Number(params.houseCitizens) || 0) +
      subscriberBudgetCitizens) *
    getRaceIdentity(params.race).citizenRecoveryMultiplier
  );
}

/** Calculates spy mission power used by combat, economy, or presentation logic. */
export function calculateSpyMissionPower(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) ** 0.35;
}

/** Calculates intel quality multiplier used by combat, economy, or presentation logic. */
export function calculateIntelQualityMultiplier(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS) ** 0.45;
}

/**
 * Calculates the casualty budget for one side of a battle.
 *
 * The ceiling is replacement-anchored: no battle destroys more than
 * min(CASUALTY_BUDGET_RECOVERY_DAYS days of throughput, 8% of the population
 * at risk). Every modifier below can only reduce the budget — they express how
 * hard the battle pressed and how well the target was protected, never amplify
 * past the rebuild guarantee.
 */
export function calculateCasualtyBudget(params: {
  dailyThroughput: number;
  population: number;
  turns: number;
  levelDifference: number;
  winQuality: number;
  fortHpPercent: number;
  defensePressureToday: number;
}): number {
  const ceiling = Math.min(
    Math.max(0, Number(params.dailyThroughput) || 0) *
      V5_COMBAT_CONSTANTS.CASUALTY_BUDGET_RECOVERY_DAYS,
    Math.max(0, Number(params.population) || 0) *
      V5_COMBAT_CONSTANTS.SINGLE_ATTACK_POPULATION_LOSS_CAP,
  );
  const fortHp = clamp(params.fortHpPercent, 0, 1);
  const fortProtection = (1 - 0.3 * fortHp) * (1 - 0.25 * fortHp);

  return (
    ceiling *
    Math.min(1, calculateTurnDamageFactor(params.turns)) *
    clamp(1 - params.levelDifference * 0.08, 0.8, 1) *
    clamp(params.winQuality, 0.3, 1) *
    fortProtection *
    calculatePressureProtection(params.defensePressureToday)
  );
}

/** Soft cap casualties. */
export function softCapCasualties(
  rawCasualties: number,
  budget: number,
): number {
  const safeBudget = Math.max(0, budget);
  return safeBudget > 0
    ? safeBudget * (1 - Math.exp(-Math.max(0, rawCasualties) / safeBudget))
    : 0;
}

/**
 * Share of maximum fort hitpoints one assault turn removes, before the
 * per-battle cap. Successful assaults (ratio >= 1) scale from
 * MIN_SHARE_PER_TURN up to MAX_SHARE_PER_TURN at OVERWHELM_RATIO; repelled
 * assaults above CHIP_MIN_RATIO still chip a fraction of a marginal success,
 * and anything weaker leaves the walls untouched.
 */
export function calculateFortDamageShare(pressureRatio: number): number {
  const c = V5_COMBAT_CONSTANTS.FORT_DAMAGE;
  const ratio = Math.max(0, Number(pressureRatio) || 0);
  if (ratio >= 1) {
    const t = clamp((ratio - 1) / Math.max(1e-9, c.OVERWHELM_RATIO - 1), 0, 1);
    return (
      c.MIN_SHARE_PER_TURN + (c.MAX_SHARE_PER_TURN - c.MIN_SHARE_PER_TURN) * t
    );
  }
  if (ratio < c.CHIP_MIN_RATIO) return 0;
  const t = (ratio - c.CHIP_MIN_RATIO) / (1 - c.CHIP_MIN_RATIO);
  return c.MIN_SHARE_PER_TURN * c.CHIP_SHARE_OF_SUCCESS * t;
}
