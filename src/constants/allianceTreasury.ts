/** Client-safe alliance treasury limits shared by services and UI. */

/** Max length of a transfer note or gold request reason. */
export const ALLIANCE_NOTE_MAX_LENGTH = 200;

/** Maximum PENDING gold requests one member may have per alliance. */
export const MAX_PENDING_GOLD_REQUESTS = 3;

/** Loan term bounds in OT days (leader-configurable per alliance). */
export const LOAN_TERM_DAYS_MIN = 1;
export const LOAN_TERM_DAYS_MAX = 14;
export const LOAN_TERM_DAYS_DEFAULT = 7;

/** Flat loan interest bounds in percent of the principal. */
export const LOAN_INTEREST_PCT_MIN = 0;
export const LOAN_INTEREST_PCT_MAX = 25;
export const LOAN_INTEREST_PCT_DEFAULT = 10;

/**
 * Per-member daily cap on treasury outflow (transfers, approved gold requests
 * and loan principal), also the maximum single loan. Whole gold amounts.
 */
export const MEMBER_DAILY_CAP_MIN = 100_000;
export const MEMBER_DAILY_CAP_MAX = 50_000_000;
export const MEMBER_DAILY_CAP_DEFAULT = 5_000_000;

/** Share of a borrower's income diverted to the treasury while a loan is open. */
export const LOAN_INCOME_SHARE_PERCENT = 25;

/**
 * Amount owed for a loan: principal plus flat interest, rounded up to whole
 * gold. Fixed when the loan is approved.
 */
export const computeLoanOwed = (
  principal: bigint,
  interestPct: number,
): bigint => principal + (principal * BigInt(interestPct) + 99n) / 100n;
