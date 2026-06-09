import type { BonusType, PlayerClass, PlayerRace } from '@/types/typings';

export const V5_COMBAT_CONSTANTS = {
  MAX_ATTACK_TURNS: 10,
  REQUIRED_ATTACKER_ADVANTAGE: 1.05,
  BASE_XP: 1000,
  MORALE_EXHAUSTION_PER_TURN: 0.025,
  MAX_GOLD_PILLAGE_SHARE: 0.22,
  DEFENSE_COVERAGE_THRESHOLD: 0.25,
  SINGLE_ATTACK_POPULATION_LOSS_CAP: 0.08,
  DAILY_POPULATION_LOSS_CAP: 0.2,
  BASE_DAILY_SELF_CLICKS: 225,
  BASE_DAILY_RECEIVED_CLICKS: 25,
  SUBSCRIBER_CITIZENS_PER_DAY: 300,
  TURN_10_COMBAT_PRESSURE_MULTIPLIER: 1.25,
  TURN_10_FORT_DAMAGE_BONUS: 1.35,
  TURN_10_GOLD_BONUS: 1.2,
  TURN_10_MORALE_PENALTY_BONUS: 1.2,
  UNDER_DEFENDED_MAX_FORT_DAMAGE_MULTIPLIER: 1.5,
  UNDER_DEFENDED_MAX_REWARD_MULTIPLIER: 1.25,
  WOUNDED_RECOVERY_PER_TICK: 0.03,
  MAX_SPY_MISSION_TURNS: 10,
  MAX_INTEL_TURNS: 5,
  MIN_INFILTRATION_TURNS: 2,
  MIN_ASSASSINATION_TURNS: 3,
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

function normalizeClass(playerClass: unknown): PlayerClass {
  const normalized = String(playerClass ?? '').toUpperCase();
  if (
    normalized === 'FIGHTER' ||
    normalized === 'CLERIC' ||
    normalized === 'ASSASSIN' ||
    normalized === 'THIEF'
  ) {
    return normalized;
  }
  if (normalized === 'WARRIOR') return 'FIGHTER';
  return 'FIGHTER';
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

function calculateLevelMultiplier(level: number): number {
  return Math.max(1, Math.max(1, Number(level) || 1) ** 0.12);
}

function calculateTurnPower(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS) ** 0.35;
}

function calculateTurnXp(turns: number): number {
  return 1 + Math.log(clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS));
}

/**
 * Calculates the gold reward scaling applied for the number of attack turns spent.
 */
export function calculateGoldRewardMultiplier(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS) ** 0.55;
}

function calculateFortDamageMultiplier(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS) ** 0.7;
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

function calculateXpLevelModifier(levelDifference: number): number {
  return clamp(1 + levelDifference * 0.18, 0.2, 2);
}

/**
 * Calculates the gold modifier caused by the attacker/defender level gap.
 */
export function calculateGoldLevelModifier(levelDifference: number): number {
  return clamp(1 + levelDifference * 0.05, 0.7, 1.25);
}

function calculateLevelDamageFactor(levelDifference: number): number {
  return clamp(1 - levelDifference * 0.08, 0.75, 1.5);
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
    fortDamageMultiplier: 1 + deficit * 0.5,
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

/** Calculates effective daily recovery used by combat, economy, or presentation logic. */
export function calculateEffectiveDailyRecovery(params: {
  houseCitizens: number;
  dailyClicks?: number;
  receivedClicks?: number;
  isSubscriber?: boolean;
  race?: unknown;
}): number {
  const clickCitizens = clamp(
    Number(params.dailyClicks ?? 0),
    0,
    V5_COMBAT_CONSTANTS.BASE_DAILY_SELF_CLICKS,
  );
  const receivedClickCitizens = clamp(
    Number(params.receivedClicks ?? 0),
    0,
    V5_COMBAT_CONSTANTS.BASE_DAILY_RECEIVED_CLICKS,
  );
  const subscriberCitizens = params.isSubscriber
    ? V5_COMBAT_CONSTANTS.SUBSCRIBER_CITIZENS_PER_DAY * 0.6
    : 0;

  return (
    (Math.max(0, Number(params.houseCitizens) || 0) +
      clickCitizens +
      receivedClickCitizens +
      subscriberCitizens) *
    getRaceIdentity(params.race).citizenRecoveryMultiplier
  );
}

function calculateActivityRecoveryModifier(dailyClicks?: number): number {
  const completion =
    clamp(
      Number(dailyClicks ?? 0),
      0,
      V5_COMBAT_CONSTANTS.BASE_DAILY_SELF_CLICKS,
    ) / V5_COMBAT_CONSTANTS.BASE_DAILY_SELF_CLICKS;
  return 0.75 + 0.25 * completion;
}

function calculateTurnDamageFactor(turns: number): number {
  return 0.08 * clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS) ** 1.15;
}

/** Calculates spy mission power used by combat, economy, or presentation logic. */
export function calculateSpyMissionPower(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) ** 0.35;
}

/** Calculates intel quality multiplier used by combat, economy, or presentation logic. */
export function calculateIntelQualityMultiplier(turns: number): number {
  return clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS) ** 0.45;
}

/** Calculates spy mission damage factor used by combat, economy, or presentation logic. */
export function calculateSpyMissionDamageFactor(turns: number): number {
  return (
    0.04 * clamp(turns, 1, V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) ** 1.1
  );
}

/** Calculates casualty budget used by combat, economy, or presentation logic. */
export function calculateCasualtyBudget(params: {
  effectiveDailyRecovery: number;
  dailyClicks?: number;
  turns: number;
  levelDifference: number;
  winQuality: number;
  fortHpPercent: number;
  defensePressureToday: number;
}): number {
  const fortProtection = 1 - 0.3 * clamp(params.fortHpPercent, 0, 1);
  const fortExposure = 1 + (1 - clamp(params.fortHpPercent, 0, 1)) * 0.75;
  return (
    Math.max(1, params.effectiveDailyRecovery) *
    calculateActivityRecoveryModifier(params.dailyClicks) *
    calculateTurnDamageFactor(params.turns) *
    calculateLevelDamageFactor(params.levelDifference) *
    clamp(params.winQuality, 0.25, 2) *
    fortProtection *
    fortExposure *
    calculatePressureProtection(params.defensePressureToday)
  );
}

/** Soft cap casualties. */
export function softCapCasualties(
  rawCasualties: number,
  budget: number,
): number {
  const safeBudget = Math.max(1, budget);
  return safeBudget * (1 - Math.exp(-Math.max(0, rawCasualties) / safeBudget));
}
