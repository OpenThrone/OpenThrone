export const DEPOSIT_CAP_PERCENT = 80;

/**
 * Calculates the maximum deposit amount allowed based on gold on hand.
 * Returns 0n if gold is less than or equal to 0n.
 * Uses integer BigInt arithmetic (never floats).
 */
export const getMaxDeposit = (gold: bigint): bigint => {
  if (gold <= 0n) {
    return 0n;
  }
  return (gold * BigInt(DEPOSIT_CAP_PERCENT)) / 100n;
};
