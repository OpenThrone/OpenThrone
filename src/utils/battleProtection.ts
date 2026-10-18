import { HouseUpgrades } from '@/constants';
import { resolveEraStartSettings } from '@/utils/eraStartSettings';
import { getLevelFromXP } from '@/utils/utilities';

/** Protection always ends once a player reaches this level. */
export const PROTECTION_LEVEL_LIMIT = 10;
export const DEFAULT_PROTECTION_DURATION_DAYS = 14;
export const MIN_PROTECTION_DURATION_DAYS = 1;
export const MAX_PROTECTION_DURATION_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Why a player is (or is no longer) protected. `ACTIVE` means still protected. */
export type ProtectionReason =
  | 'ACTIVE'
  | 'FORFEITED'
  | 'LEVEL'
  | 'POPULATION'
  | 'TIME';

/** Player fields the shared protection rule reads. */
export interface ProtectionUserInput {
  experience: number;
  /** Total population: every unit and mercenary incl. citizens. */
  population: number;
  houseLevel: number;
  /** `users.era_joined_at`; null on legacy rows. */
  eraJoinedAt?: Date | string | null;
  /** `users.created_at`; fallback anchor for legacy rows. */
  createdAt?: Date | string | null;
  /** `users.protection_forfeited_era_id`. */
  protectionForfeitedEraId?: number | null;
}

/** Era fields the rule reads. */
export interface ProtectionEraInput {
  id: number;
  startDate: Date | string;
  startSettings?: unknown;
}

/** Admin-tunable inputs (see RuntimeConfig). */
export interface ProtectionSettings {
  durationDays: number;
  dailyCitizenBonus: number;
}

export interface ProtectionStatus {
  protected: boolean;
  reason: ProtectionReason;
  /** Time-limit expiry (null when no era is known). Present even after another end condition fired. */
  endsAt: Date | null;
  levelLimit: number;
  level: number;
  population: number;
  populationThreshold: number;
  forfeited: boolean;
  durationDays: number;
  /** Whole-and-fractional days until `endsAt`, floored at 0. */
  daysLeft: number | null;
  /** 0-1 share of the protection window still remaining, for progress bars. */
  timeRemainingShare: number | null;
}

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Clamps an admin value into the supported 1-60 day window. */
export function normalizeProtectionDurationDays(value: unknown): number {
  const days = Math.floor(Number(value));
  if (!Number.isFinite(days)) return DEFAULT_PROTECTION_DURATION_DAYS;
  return Math.min(
    MAX_PROTECTION_DURATION_DAYS,
    Math.max(MIN_PROTECTION_DURATION_DAYS, days),
  );
}

/**
 * Population threshold that ends protection.
 *
 * Daily citizen growth is the housing grant for the player's house level
 * (`HouseUpgrades[houseLevel].citizensDaily`, the same value the daily cron
 * reads through `UserEconomyService.getRecruitingBonus`) plus the admin
 * `era.dailyCitizenBonus`, multiplied by the protection duration in days (the
 * same day count as the time limit). The era's starting citizens are added as
 * a baseline: every player starts with them, so without it a fresh account
 * (50 citizens) would already exceed a 14-day threshold of 14-20 citizens and
 * never be protected. Pass `startingPopulation: 0` for the literal formula.
 */
export function getProtectionPopulationThreshold(params: {
  houseLevel: number;
  dailyCitizenBonus: number;
  durationDays: number;
  startingPopulation?: number;
}): number {
  const maxHouseLevel = Object.keys(HouseUpgrades).length - 1;
  const houseLevel = Math.min(
    maxHouseLevel,
    Math.max(0, Math.floor(Number(params.houseLevel) || 0)),
  );
  const house = HouseUpgrades[houseLevel as keyof typeof HouseUpgrades];
  const dailyGrowth =
    Number(house?.citizensDaily ?? 0) +
    Math.max(0, Math.floor(Number(params.dailyCitizenBonus) || 0));
  return (
    Math.max(0, Math.floor(Number(params.startingPopulation) || 0)) +
    dailyGrowth * normalizeProtectionDurationDays(params.durationDays)
  );
}

/**
 * The single battle-protection rule. A player is protected until the FIRST of:
 * forfeiture by attacking an unprotected player this era, level 10, reaching
 * the population threshold, or `durationDays` after joining the era.
 *
 * Join time is `users.era_joined_at`; legacy rows (null) fall back to
 * max(era.startDate, users.created_at). With no era only the level, forfeit
 * and population rules apply.
 */
export function getProtectionStatus(
  user: ProtectionUserInput,
  era: ProtectionEraInput | null | undefined,
  settings: ProtectionSettings,
  now: Date = new Date(),
): ProtectionStatus {
  const durationDays = normalizeProtectionDurationDays(settings.durationDays);
  const level = getLevelFromXP(user.experience ?? 0);
  const population = Math.max(0, Math.floor(Number(user.population) || 0));
  const populationThreshold = getProtectionPopulationThreshold({
    houseLevel: user.houseLevel,
    dailyCitizenBonus: settings.dailyCitizenBonus,
    durationDays,
    startingPopulation: era
      ? resolveEraStartSettings(era.startSettings).citizens
      : 0,
  });
  const forfeited =
    !!era &&
    user.protectionForfeitedEraId !== null &&
    user.protectionForfeitedEraId !== undefined &&
    user.protectionForfeitedEraId === era.id;

  let endsAt: Date | null = null;
  if (era) {
    const eraStart = toDate(era.startDate);
    const joined =
      toDate(user.eraJoinedAt) ??
      (() => {
        const created = toDate(user.createdAt);
        if (eraStart && created) return created > eraStart ? created : eraStart;
        return eraStart ?? created;
      })();
    if (joined) endsAt = new Date(joined.getTime() + durationDays * DAY_MS);
  }

  let reason: ProtectionReason = 'ACTIVE';
  if (forfeited) reason = 'FORFEITED';
  else if (level >= PROTECTION_LEVEL_LIMIT) reason = 'LEVEL';
  else if (population >= populationThreshold) reason = 'POPULATION';
  else if (endsAt && now.getTime() >= endsAt.getTime()) reason = 'TIME';

  const msLeft = endsAt ? Math.max(0, endsAt.getTime() - now.getTime()) : null;
  return {
    protected: reason === 'ACTIVE',
    reason,
    endsAt,
    levelLimit: PROTECTION_LEVEL_LIMIT,
    level,
    population,
    populationThreshold,
    forfeited,
    durationDays,
    daysLeft: msLeft === null ? null : msLeft / DAY_MS,
    timeRemainingShare:
      msLeft === null ? null : Math.min(1, msLeft / (durationDays * DAY_MS)),
  };
}

/** JSON-safe protection status served on the player's own data (`/api/general/getUser`). */
export type ProtectionSummary = Omit<ProtectionStatus, 'endsAt'> & {
  endsAt: string | null;
};

/** Serializes a status for the API (dates become ISO strings). */
export function toProtectionSummary(
  status: ProtectionStatus,
): ProtectionSummary {
  return { ...status, endsAt: status.endsAt?.toISOString() ?? null };
}

/**
 * True when a battle forfeits the attacker's protection: only a currently
 * protected attacker hitting a NON-protected defender loses it.
 */
export function shouldForfeitProtection(
  attackerProtected: boolean,
  defenderProtected: boolean,
): boolean {
  return attackerProtected && !defenderProtected;
}
