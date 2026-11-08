import { staminaDrainFactor } from '@/constants/ArmyStamina';

/** Stamina is recovered in whole intervals. The timestamp retains the remainder. */
export interface StaminaRules {
  penaltyThreshold: number;
  minOffensePercent: number;
  enabled: boolean;
  recoveryEnabled: boolean;
  recoveryAmount: number;
  recoveryIntervalMinutes: number;
  baseCost: number;
  perTurnCost: number;
}

export const DEFAULT_STAMINA_RULES: StaminaRules = {
  penaltyThreshold: 50,
  minOffensePercent: 80,
  enabled: true,
  recoveryEnabled: true,
  recoveryAmount: 5,
  recoveryIntervalMinutes: 10,
  baseCost: 2,
  perTurnCost: 0.5,
};

export interface StaminaBalance {
  stamina: number;
  maxStamina: number;
  staminaUpdatedAt: Date;
}

export function staminaCost(
  turns: number,
  rules: StaminaRules,
  offenseUpgradeLevel = 1,
): number {
  return rules.enabled
    ? Math.ceil(
        Number(
          (
            (rules.baseCost + Math.max(0, turns) * rules.perTurnCost) *
            staminaDrainFactor(offenseUpgradeLevel)
          ).toFixed(9),
        ),
      )
    : 0;
}

export function projectStamina(
  balance: StaminaBalance,
  rules: StaminaRules,
  now = new Date(),
): StaminaBalance {
  const maxStamina = Math.max(0, balance.maxStamina);
  const stamina = Math.max(0, Math.min(maxStamina, balance.stamina));
  const timestamp = Math.min(now.getTime(), balance.staminaUpdatedAt.getTime());
  if (!rules.enabled || !rules.recoveryEnabled || stamina >= maxStamina) {
    return { stamina, maxStamina, staminaUpdatedAt: now };
  }
  const interval = rules.recoveryIntervalMinutes * 60_000;
  const intervals = Math.floor((now.getTime() - timestamp) / interval);
  const recovered = Math.min(
    maxStamina,
    stamina + intervals * rules.recoveryAmount,
  );
  return {
    stamina: recovered,
    maxStamina,
    staminaUpdatedAt:
      recovered >= maxStamina
        ? now
        : new Date(timestamp + intervals * interval),
  };
}

/** "3h 20m" or "45m", rounded up; the space never breaks a line. */
export function formatStaminaDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h\u00a0${minutes % 60}m` : `${minutes}m`;
}

/** Turns in the worked cost example players read in the guides. */
export const STAMINA_EXAMPLE_TURNS = 10;

/** Values the player guides interpolate, from the live server rules. */
export function staminaGuideValues(rules: StaminaRules, maxStamina = 100) {
  const intervals =
    rules.recoveryAmount > 0 ? Math.ceil(maxStamina / rules.recoveryAmount) : 0;
  return {
    max: maxStamina,
    base: rules.baseCost,
    perTurn: rules.perTurnCost,
    turns: STAMINA_EXAMPLE_TURNS,
    example: staminaCost(STAMINA_EXAMPLE_TURNS, rules),
    amount: rules.recoveryAmount,
    minutes: rules.recoveryIntervalMinutes,
    fullTime: formatStaminaDuration(
      intervals * rules.recoveryIntervalMinutes * 60_000,
    ),
    threshold: rules.penaltyThreshold,
    floor: rules.minOffensePercent,
  };
}
