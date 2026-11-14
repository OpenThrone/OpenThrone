/**
 * Alliance join fee and recurring dues (gold). Client-safe single source of
 * truth shared by the services, the API routes, the Settings card, the
 * Overview/Bank/Members tabs and the admin editors. Owner-approved gameplay
 * rules: see docs/decisions/alliance-join-fee-and-dues.md before changing any
 * number.
 *
 * - The join fee is paid once from the joiner's gold on hand into the
 *   treasury, on every path that adds a member (the founder pays nothing).
 * - Dues are taken from every non-leader member's gold on hand once per
 *   period boundary by the daily job. What a member cannot pay accrues as
 *   arrears, collected first at later runs or paid from the alliance page.
 *   Nobody is ever removed for unpaid dues.
 */
import type {
  AllianceErrorParams,
  AllianceRefusal,
} from '@/constants/allianceErrors';
import {
  ALLIANCE_RULE_CODES,
  AllianceRuleError,
} from '@/constants/allianceErrors';
import {
  getGameDayStart,
  getOTDayKey,
  otWallClockToDate,
} from '@/utils/timefunctions';

/** Mirrors the Prisma enum AllianceDuesPeriod (kept client-safe here). */
export const ALLIANCE_DUES_PERIODS = [
  'NONE',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
] as const;

export type AllianceDuesPeriod = (typeof ALLIANCE_DUES_PERIODS)[number];

/** Periods that actually collect dues. */
export const ALLIANCE_DUES_ACTIVE_PERIODS = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
] as const;

/** Highest join fee an alliance may charge, in gold. */
export const ALLIANCE_JOIN_FEE_MAX = 10_000_000n;

/** Highest dues per member per period, in gold. */
export const ALLIANCE_DUES_MAX: Record<
  Exclude<AllianceDuesPeriod, 'NONE'>,
  bigint
> = {
  DAILY: 1_000_000n,
  WEEKLY: 5_000_000n,
  MONTHLY: 20_000_000n,
};

/**
 * Highest dues arrears staff may set on a membership in the admin editor.
 * Far above anything collection can reach in one era (DAILY maximum for a
 * full year is 365,000,000), so it only rejects typing mistakes.
 */
export const ALLIANCE_DUES_ARREARS_MAX = 1_000_000_000n;

/** i18n key (alliances namespace) for a period's name. */
export const allianceDuesPeriodKey = (period: AllianceDuesPeriod) =>
  `memberDues.period.${period}`;

export const isAllianceDuesPeriod = (
  value: unknown,
): value is AllianceDuesPeriod =>
  typeof value === 'string' &&
  (ALLIANCE_DUES_PERIODS as readonly string[]).includes(value);

/** Business refusal for a fee or dues rule; the message is safe to show. */
export class AllianceDuesError extends AllianceRuleError {
  constructor(code: string, message: string, params: AllianceErrorParams = {}) {
    super(code, message, params);
    this.name = 'AllianceDuesError';
  }
}

/** Stable error codes so the UI can explain a refusal. */
export const ALLIANCE_DUES_CODES = {
  feeUnpaid: 'ALLIANCE_JOIN_FEE_UNPAID',
  feeChanged: 'ALLIANCE_JOIN_FEE_CHANGED',
  invalid: 'ALLIANCE_DUES_INVALID',
} as const;

const formatGold = (amount: bigint) => amount.toLocaleString('en-US');

/**
 * Validates a fee and dues setting. Returns the refusal (English message plus
 * a code and params the UI translates), or null when the setting is allowed.
 * Shared by the player and admin routes.
 */
export const validateAllianceDuesSettingsDetailed = (settings: {
  joinFee: bigint;
  duesAmount: bigint;
  duesPeriod: AllianceDuesPeriod;
}): AllianceRefusal | null => {
  const { joinFee, duesAmount, duesPeriod } = settings;
  if (joinFee < 0n || duesAmount < 0n) {
    return {
      code: ALLIANCE_RULE_CODES.settingsNegative,
      message: 'Fee and dues cannot be negative.',
    };
  }
  if (joinFee > ALLIANCE_JOIN_FEE_MAX) {
    return {
      code: ALLIANCE_RULE_CODES.settingsFeeMax,
      message: `The join fee can be at most ${formatGold(ALLIANCE_JOIN_FEE_MAX)} gold.`,
      params: { max: Number(ALLIANCE_JOIN_FEE_MAX) },
    };
  }
  if (duesPeriod === 'NONE') {
    return duesAmount > 0n
      ? {
          code: ALLIANCE_RULE_CODES.settingsNeedPeriod,
          message: 'Choose how often dues are collected, or set the dues to 0.',
        }
      : null;
  }
  if (duesAmount === 0n) {
    return {
      code: ALLIANCE_RULE_CODES.settingsNeedAmount,
      message: 'Set a dues amount above 0, or choose "No dues".',
    };
  }
  const max = ALLIANCE_DUES_MAX[duesPeriod];
  if (duesAmount > max) {
    return {
      code: ALLIANCE_RULE_CODES.settingsAmountMax,
      message: `${duesPeriod.charAt(0)}${duesPeriod.slice(1).toLowerCase()} dues can be at most ${formatGold(max)} gold per member.`,
      params: { max: Number(max), period: duesPeriod },
    };
  }
  return null;
};

/** English refusal text for a fee and dues setting, or null when allowed. */
export const validateAllianceDuesSettings = (
  settings: Parameters<typeof validateAllianceDuesSettingsDetailed>[0],
): string | null =>
  validateAllianceDuesSettingsDetailed(settings)?.message ?? null;

const ymd = (from: Date) => {
  const [year, month, day] = getOTDayKey(from).split('-').map(Number);
  return { year, month, day };
};

/** Days since Monday (0..6) of an OT calendar date. */
const daysSinceMonday = (year: number, month: number, day: number) =>
  (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;

/**
 * Start of the dues period containing `now` (the last boundary), or null for
 * NONE. DAILY follows the game day (OT midnight on a real-day server), WEEKLY
 * starts Monday 00:00 OT and MONTHLY the 1st of the month 00:00 OT.
 */
export const getDuesPeriodStart = (
  period: AllianceDuesPeriod | string | null | undefined,
  now: Date = new Date(),
): Date | null => {
  switch (period) {
    case 'DAILY':
      return getGameDayStart(0, now);
    case 'WEEKLY': {
      const { year, month, day } = ymd(now);
      return otWallClockToDate(
        year,
        month,
        day - daysSinceMonday(year, month, day),
      );
    }
    case 'MONTHLY': {
      const { year, month } = ymd(now);
      return otWallClockToDate(year, month, 1);
    }
    default:
      return null;
  }
};

/** The next boundary after `now`, when dues are next collected; null for NONE. */
export const getNextDuesCollection = (
  period: AllianceDuesPeriod | string | null | undefined,
  now: Date = new Date(),
): Date | null => {
  switch (period) {
    case 'DAILY':
      return getGameDayStart(1, now);
    case 'WEEKLY': {
      const { year, month, day } = ymd(now);
      return otWallClockToDate(
        year,
        month,
        day - daysSinceMonday(year, month, day) + 7,
      );
    }
    case 'MONTHLY': {
      const { year, month } = ymd(now);
      return otWallClockToDate(year, month + 1, 1);
    }
    default:
      return null;
  }
};

/** Settings tab of an alliance page: where the leader changes fee and dues. */
export const allianceDuesSettingsHref = (allianceId: number) =>
  `/alliances/${allianceId}?tab=settings`;

/** Reads a serialized BigInt ("123n", "123", 123) as a bigint; bad input is 0. */
export const toDuesBigInt = (
  value: bigint | string | number | null | undefined,
): bigint => {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined) return 0n;
  const text = String(value).trim().replace(/n$/, '');
  return /^-?\d+$/.test(text) ? BigInt(text) : 0n;
};
