import type { AllianceErrorParams } from '@/constants/allianceErrors';
import { AllianceRuleError } from '@/constants/allianceErrors';
/**
 * Alliance Hall levels (alliance upgrades). Client-safe single source of truth
 * shared by the services, the API routes, the Upgrades tab, the deposit form
 * and the admin editor. Owner-approved gameplay rules: see
 * docs/decisions/alliance-hall-levels.md before changing any number.
 *
 * A level is bought one at a time with treasury gold. It raises the member
 * cap, how many deposits each member may make per rolling 24 hours, and how
 * much gold the treasury may hold (deposits only).
 */
export interface AllianceLevel {
  level: number;
  /** English name; the UI shows the `upgrades.levels.<level>` i18n key. */
  name: string;
  /** Treasury gold spent to reach this level from the one below. */
  cost: bigint;
  /** Members the alliance must already have before buying this level. */
  minMembers: number;
  /** Most members the alliance may hold at this level. */
  maxMembers: number;
  /** Deposits each member may make per rolling 24 hours. */
  depositsPer24h: number;
  /** Most gold a deposit may bring the treasury to. */
  treasuryCap: bigint;
}

export const ALLIANCE_LEVELS: readonly AllianceLevel[] = [
  {
    level: 0,
    name: 'Camp',
    cost: 0n,
    minMembers: 0,
    maxMembers: 10,
    depositsPer24h: 2,
    treasuryCap: 5_000_000n,
  },
  {
    level: 1,
    name: 'Hall',
    cost: 2_000_000n,
    minMembers: 5,
    maxMembers: 20,
    depositsPer24h: 3,
    treasuryCap: 25_000_000n,
  },
  {
    level: 2,
    name: 'Great Hall',
    cost: 10_000_000n,
    minMembers: 10,
    maxMembers: 35,
    depositsPer24h: 4,
    treasuryCap: 100_000_000n,
  },
  {
    level: 3,
    name: 'Keep',
    cost: 50_000_000n,
    minMembers: 20,
    maxMembers: 50,
    depositsPer24h: 5,
    treasuryCap: 500_000_000n,
  },
  {
    level: 4,
    name: 'Citadel',
    cost: 250_000_000n,
    minMembers: 30,
    maxMembers: 75,
    depositsPer24h: 6,
    treasuryCap: 2_000_000_000n,
  },
  {
    level: 5,
    name: 'Stronghold',
    cost: 1_000_000_000n,
    minMembers: 50,
    maxMembers: 100,
    depositsPer24h: 8,
    treasuryCap: 10_000_000_000n,
  },
] as const;

export const ALLIANCE_LEVEL_MIN = 0;
export const ALLIANCE_LEVEL_MAX = ALLIANCE_LEVELS.length - 1;

/** Length of the rolling deposit window. */
export const ALLIANCE_DEPOSIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The level's rules. Out-of-range or missing values clamp into 0..max, so a
 * legacy row without hall_level is treated as Camp.
 */
export const getAllianceLevel = (
  level: number | null | undefined,
): AllianceLevel => {
  const n = Number.isFinite(level) ? Math.trunc(Number(level)) : 0;
  const clamped = Math.min(Math.max(n, ALLIANCE_LEVEL_MIN), ALLIANCE_LEVEL_MAX);
  return ALLIANCE_LEVELS[clamped];
};

/** The next level to buy, or null at the top level. */
export const getNextAllianceLevel = (
  level: number | null | undefined,
): AllianceLevel | null => {
  const current = getAllianceLevel(level);
  return ALLIANCE_LEVELS[current.level + 1] ?? null;
};

/** i18n key (alliances namespace) for a level's name. */
export const allianceLevelNameKey = (level: number) =>
  `upgrades.levels.${level}`;

/** Stable error codes so the UI can explain a refusal and link the fix. */
export const ALLIANCE_LIMIT_CODES = {
  full: 'ALLIANCE_FULL',
  depositSlots: 'ALLIANCE_DEPOSIT_LIMIT',
  treasuryCap: 'ALLIANCE_TREASURY_CAP',
} as const;

/** Business refusal for an alliance limit; the message is safe to show. */
export class AllianceLimitError extends AllianceRuleError {
  constructor(code: string, message: string, params: AllianceErrorParams = {}) {
    super(code, message, params);
    this.name = 'AllianceLimitError';
  }
}

/** Refusal used by every path that adds a member to a full alliance. */
export const allianceFullError = (memberCount: number, level: number) => {
  const rules = getAllianceLevel(level);
  return new AllianceLimitError(
    ALLIANCE_LIMIT_CODES.full,
    `The alliance is full (${memberCount}/${rules.maxMembers} members at ${rules.name}). Upgrade the Alliance Hall to raise it.`,
    { count: memberCount, max: rules.maxMembers, level: rules.level },
  );
};

/** The Upgrades tab of an alliance page: where every limit above is raised. */
export const allianceUpgradesHref = (allianceId: number) =>
  `/alliances/${allianceId}?tab=upgrades`;
