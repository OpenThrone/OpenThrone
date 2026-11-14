export const DEPOSIT_CAP_PERCENT = 80;

/**
 * Calculates the maximum deposit amount allowed based on gold on hand.
 * The bank balance itself has no upper limit (docs/decisions/no-bank-capacity.md).
 * Returns 0n if gold is less than or equal to 0n.
 * Uses integer BigInt arithmetic (never floats).
 */
export const getMaxDeposit = (
  gold: bigint,
  percent = DEPOSIT_CAP_PERCENT,
): bigint => {
  if (gold <= 0n) {
    return 0n;
  }
  return (gold * BigInt(percent)) / 100n;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Lines under the deposits-remaining count: the window length always, and a
 * countdown to the next free slot once one is used (#299).
 */
export const depositLimitNotes = (
  t: Translate,
  windowHours: number,
  available: number,
  maximum: number,
  next?: { hours: number; minutes: number } | null,
): string[] => {
  const notes = [t('bank.rollingDepositLimit', { hours: windowHours })];
  if (next && available < maximum) {
    notes.push(
      t('bank.nextDepositIn', {
        hours: next.hours,
        minutes: String(next.minutes).padStart(2, '0'),
      }),
    );
  }
  return notes;
};
