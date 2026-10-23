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
export type ProtectionReason = 'ACTIVE' | 'LEVEL' | 'POPULATION' | 'TIME';

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
  /** Legacy database field, ignored: outgoing attacks never forfeit protection. */
  protectionForfeitedEraId?: number | null;
  /**
   * `users.event_citizens_received`: citizens this era from timed citizen
   * events and citizen multipliers. They raise the population limit so an
   * admin event never ends protection by itself (#89).
   */
  eventCitizensReceived?: number | null;
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
  /** Combined daily internal and external recruitment allowance. */
  recruitDailyCap: number;
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
  /** Kept for API compatibility; attacking no longer forfeits protection. */
  forfeited: false;
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
 * Population threshold that ends protection (#97):
 *
 *   starting citizens + days x (housing citizens per day + internal and external recruit allowances)
 *
 * Housing growth is `HouseUpgrades[houseLevel].citizensDaily` (the value the
 * daily cron grants); the recruiting cap is the most a player can gain per day
 * by internal and external recruiting. The era's starting citizens are a
 * baseline every player gets. Citizens handed out by game events are
 * not part of this formula: getProtectionStatus adds the player's
 * event_citizens_received on top, so no event can end protection.
 * Pass `startingPopulation: 0` for the literal formula.
 */
export function getProtectionPopulationThreshold(params: {
  houseLevel: number;
  recruitDailyCap: number;
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
    Math.max(0, Math.floor(Number(params.recruitDailyCap) || 0));
  return (
    Math.max(0, Math.floor(Number(params.startingPopulation) || 0)) +
    dailyGrowth * normalizeProtectionDurationDays(params.durationDays)
  );
}

/**
 * The single battle-protection rule. A player is protected until the FIRST of:
 * level 10, reaching the population threshold, or `durationDays` after joining
 * the era. Outgoing attacks never end protection, including legacy forfeitures.
 *
 * Join time is `users.era_joined_at`; legacy rows (null) fall back to
 * max(era.startDate, users.created_at). With no era only the level
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
  const populationThreshold =
    getProtectionPopulationThreshold({
      houseLevel: user.houseLevel,
      recruitDailyCap: settings.recruitDailyCap,
      durationDays,
      startingPopulation: era
        ? resolveEraStartSettings(era.startSettings).citizens
        : 0,
    }) + Math.max(0, Math.floor(Number(user.eventCitizensReceived) || 0));
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
  if (level >= PROTECTION_LEVEL_LIMIT) reason = 'LEVEL';
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
    forfeited: false,
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
 * How close protection is to ending, 0-1: the furthest along of the three
 * limits (time used, population vs. its threshold, level vs. the level
 * limit), since whichever is reached first ends protection.
 */
export function getProtectionProgress(
  status: Pick<
    ProtectionStatus,
    | 'level'
    | 'levelLimit'
    | 'population'
    | 'populationThreshold'
    | 'timeRemainingShare'
  >,
): { share: number; limit: 'TIME' | 'POPULATION' | 'LEVEL' } {
  const ratio = (value: number, max: number) =>
    max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const candidates = [
    {
      limit: 'TIME' as const,
      share:
        status.timeRemainingShare === null
          ? 0
          : 1 - Math.min(1, Math.max(0, status.timeRemainingShare)),
    },
    {
      limit: 'POPULATION' as const,
      share: ratio(status.population, status.populationThreshold),
    },
    { limit: 'LEVEL' as const, share: ratio(status.level, status.levelLimit) },
  ];
  return candidates.reduce((best, next) =>
    next.share > best.share ? next : best,
  );
}
