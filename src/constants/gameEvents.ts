import { z } from 'zod';

/**
 * Game event effects (#86). An event's `config` is a flat set of optional
 * effects; legacy gold events (`{ goldMultiplier }`) and XP events
 * (`{ xpMultiplier }`) are valid subsets, so existing rows keep working.
 * Shared by the server (grants and charges) and the client (cost previews,
 * the active events banner), so it must stay free of server-only imports.
 */

export const EVENT_MULTIPLIER_MIN = 0.1;
export const EVENT_MULTIPLIER_MAX = 10;
export const EVENT_MAX_EXTRA_TURNS_PER_TICK = 10;
/**
 * Untraining and selling refund 75% of the price, so any discount above 25%
 * would let players buy during an event and sell back afterwards at a profit.
 */
export const EVENT_MAX_COST_DISCOUNT_PERCENT = 25;
export const EVENT_DEFAULT_ACTIVITY_HOURS = 24;

export const CITIZEN_MULTIPLIER_SCOPES = [
  'DAILY',
  'RECRUITING',
  'BOTH',
] as const;
export type CitizenMultiplierScope = (typeof CITIZEN_MULTIPLIER_SCOPES)[number];

const Multiplier = z
  .number()
  .finite()
  .min(EVENT_MULTIPLIER_MIN)
  .max(EVENT_MULTIPLIER_MAX);
const Discount = z
  .number()
  .finite()
  .min(0)
  .max(EVENT_MAX_COST_DISCOUNT_PERCENT);

export const GameEventEffectsSchema = z
  .object({
    /** Multiplies XP from battles. */
    xpMultiplier: Multiplier.optional(),
    /** Multiplies per-turn gold income. */
    goldMultiplier: Multiplier.optional(),
    /** Flat citizens added by the daily cron. */
    dailyCitizenBonus: z.number().int().min(0).max(100000).optional(),
    /** The flat bonus only reaches players active within this many hours (0 = everyone). */
    dailyCitizenActivityHours: z.number().int().min(0).max(720).optional(),
    /** Multiplies citizens from the daily growth, player recruiting, or both. */
    citizenMultiplier: Multiplier.optional(),
    citizenMultiplierScope: z.enum(CITIZEN_MULTIPLIER_SCOPES).optional(),
    /** Turns added on top of the normal one per turn tick. */
    extraTurnsPerTick: z
      .number()
      .int()
      .min(0)
      .max(EVENT_MAX_EXTRA_TURNS_PER_TICK)
      .optional(),
    /** Percent off training units. */
    unitCostDiscountPercent: Discount.optional(),
    /** Percent off armory purchases. */
    armoryCostDiscountPercent: Discount.optional(),
  })
  .strict();

export type GameEventEffects = z.infer<typeof GameEventEffectsSchema>;

/** Effect keys that do something on their own (scope/activity hours only qualify another effect). */
export const PRIMARY_EFFECT_KEYS = [
  'xpMultiplier',
  'goldMultiplier',
  'dailyCitizenBonus',
  'citizenMultiplier',
  'extraTurnsPerTick',
  'unitCostDiscountPercent',
  'armoryCostDiscountPercent',
] as const satisfies ReadonlyArray<keyof GameEventEffects>;

export const hasPrimaryEffect = (effects: GameEventEffects): boolean =>
  PRIMARY_EFFECT_KEYS.some((key) => {
    const value = effects[key];
    if (value === undefined) return false;
    if (key.endsWith('Multiplier')) return value !== 1;
    return value > 0;
  });

export interface DailyCitizenGrant {
  amount: number;
  /** 0 means every era participant qualifies. */
  activityHours: number;
  /** True when the event lasts until the era ends (counted by battle protection). */
  eraBound: boolean;
}

export interface GameEventModifiers {
  goldMultiplier: number;
  xpMultiplier: number;
  dailyCitizenGrants: DailyCitizenGrant[];
  dailyCitizenMultiplier: number;
  recruitCitizenMultiplier: number;
  extraTurnsPerTick: number;
  unitCostDiscountPercent: number;
  armoryCostDiscountPercent: number;
}

export const DEFAULT_GAME_EVENT_MODIFIERS: GameEventModifiers = {
  goldMultiplier: 1,
  xpMultiplier: 1,
  dailyCitizenGrants: [],
  dailyCitizenMultiplier: 1,
  recruitCitizenMultiplier: 1,
  extraTurnsPerTick: 0,
  unitCostDiscountPercent: 0,
  armoryCostDiscountPercent: 0,
};

const clampMultiplier = (value: number) =>
  Math.min(EVENT_MULTIPLIER_MAX, Math.max(EVENT_MULTIPLIER_MIN, value));

/** Overlapping discounts compound (20% then 10% is 28%), capped at the refund-safe maximum. */
const stackDiscount = (current: number, next: number) =>
  Math.min(
    EVENT_MAX_COST_DISCOUNT_PERCENT,
    100 - ((100 - current) * (100 - next)) / 100,
  );

/** Parses an event config leniently: invalid or unknown effects are dropped, never applied. */
export const parseEventEffects = (config: unknown): GameEventEffects => {
  if (!config || typeof config !== 'object') return {};
  const effects: Record<string, unknown> = {};
  const { shape } = GameEventEffectsSchema;
  for (const [key, value] of Object.entries(config)) {
    const field = shape[key as keyof typeof shape];
    if (field && field.safeParse(value).success) effects[key] = value;
  }
  return effects as GameEventEffects;
};

/**
 * Combines the effects of every running event. Multipliers multiply and are
 * capped at 0.1×–10×, flat bonuses add, discounts compound up to 25%.
 */
export const combineEventEffects = (
  events: Array<{ config: unknown; eraBound?: boolean }>,
): GameEventModifiers => {
  const result: GameEventModifiers = {
    ...DEFAULT_GAME_EVENT_MODIFIERS,
    dailyCitizenGrants: [],
  };
  for (const event of events) {
    const effects = parseEventEffects(event.config);
    if (effects.goldMultiplier !== undefined)
      result.goldMultiplier = clampMultiplier(
        result.goldMultiplier * effects.goldMultiplier,
      );
    if (effects.xpMultiplier !== undefined)
      result.xpMultiplier = clampMultiplier(
        result.xpMultiplier * effects.xpMultiplier,
      );
    if (effects.dailyCitizenBonus) {
      result.dailyCitizenGrants.push({
        amount: effects.dailyCitizenBonus,
        activityHours:
          effects.dailyCitizenActivityHours ?? EVENT_DEFAULT_ACTIVITY_HOURS,
        eraBound: Boolean(event.eraBound),
      });
    }
    if (effects.citizenMultiplier !== undefined) {
      const scope = effects.citizenMultiplierScope ?? 'BOTH';
      if (scope !== 'RECRUITING')
        result.dailyCitizenMultiplier = clampMultiplier(
          result.dailyCitizenMultiplier * effects.citizenMultiplier,
        );
      if (scope !== 'DAILY')
        result.recruitCitizenMultiplier = clampMultiplier(
          result.recruitCitizenMultiplier * effects.citizenMultiplier,
        );
    }
    if (effects.extraTurnsPerTick)
      result.extraTurnsPerTick = Math.min(
        EVENT_MAX_EXTRA_TURNS_PER_TICK,
        result.extraTurnsPerTick + effects.extraTurnsPerTick,
      );
    if (effects.unitCostDiscountPercent)
      result.unitCostDiscountPercent = stackDiscount(
        result.unitCostDiscountPercent,
        effects.unitCostDiscountPercent,
      );
    if (effects.armoryCostDiscountPercent)
      result.armoryCostDiscountPercent = stackDiscount(
        result.armoryCostDiscountPercent,
        effects.armoryCostDiscountPercent,
      );
  }
  return result;
};

/** Applies an event discount to an already player-discounted integer price. */
export const applyEventDiscount = (price: number, discountPercent: number) =>
  discountPercent > 0
    ? price - Math.floor((price * discountPercent) / 100)
    : price;

/** Integer-valued multiplier of a whole count, keeping fractional multipliers fair on average. */
export const multiplyCount = (
  count: number,
  multiplier: number,
  random: () => number = Math.random,
) => {
  if (multiplier === 1) return count;
  const exact = count * multiplier;
  const whole = Math.floor(exact);
  return whole + (random() < exact - whole ? 1 : 0);
};

/**
 * Refunds are always 75% of the undiscounted price, so a refund preview built
 * from discounted prices scales back up by the event discount.
 */
export const refundFromDiscountedCost = (
  discountedCost: number,
  discountPercent: number,
) =>
  Math.floor(
    discountPercent > 0
      ? (discountedCost * 0.75 * 100) / (100 - discountPercent)
      : discountedCost * 0.75,
  );
