// Fixed friend-transfer (gift) limits. Client-safe: no env or database access.
// Env-tunable transfer settings (max amount, cooldown, fee) live in Config.service.

/** Longest note a sender may attach to a gift or gold request (characters). */
export const FRIEND_TRANSFER_NOTE_MAX_LENGTH = 200;

/**
 * Most gold one player may receive from friend transfers in a rolling 24 hours,
 * counting every sender. Stops many friends funnelling gold into one account.
 */
export const FRIEND_TRANSFER_DAILY_RECEIVED_CAP = BigInt(3_000_000);

const DIGITS_ONLY = /^\d+$/;

/**
 * Parses a gift amount from a request body. Accepts a positive safe integer as
 * a number or a plain digit string; anything else (fractions, exponents,
 * signs, words) returns null so callers can answer 400 instead of throwing.
 */
export const parseFriendTransferAmount = (value: unknown): bigint | null => {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && DIGITS_ONLY.test(value.trim())) {
    parsed = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return BigInt(parsed);
};
