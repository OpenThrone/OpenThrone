// Fixed friend-transfer (gift) limits. Client-safe: no env or database access.
// Env-tunable transfer settings (max amount, cooldown) live in Config.service.

import { hasFeature } from '@/constants/FeatureUnlocks';
import { EconomyUpgrades } from '@/constants/Structure_Upgrades';

/** Longest note a sender may attach to a gift or gold request (characters). */
export const FRIEND_TRANSFER_NOTE_MAX_LENGTH = 200;

/**
 * Transfer fee percent by economy level (EconomyUpgrades index). Levels above
 * the table pay the lowest listed rate (the last tier's).
 */
export const FRIEND_TRANSFER_FEE_PERCENT_BY_ECONOMY_LEVEL: Record<
  number,
  number
> = {
  3: 10, // Coal Mine
  4: 8, // Tavern
  5: 5, // Copper Mine
  6: 3, // Meat Market
};

/** Accounts younger than this many days cannot send or receive transfers. */
export const FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS = 7;

/** Players who fought each other within this window cannot transfer gold. */
export const FRIEND_TRANSFER_ATTACK_BLOCK_HOURS = 24;

/** Upgrade-based transfer limits for a player's economy level. */
export interface FriendTransferLimits {
  sendPerDay: bigint;
  receivePerDay: bigint;
  feePercent: number;
}

const FEE_TABLE_MAX_LEVEL = Math.max(
  ...Object.keys(FRIEND_TRANSFER_FEE_PERCENT_BY_ECONOMY_LEVEL).map(Number),
);

const feePercentForEconomyLevel = (economyLevel: number): number =>
  FRIEND_TRANSFER_FEE_PERCENT_BY_ECONOMY_LEVEL[economyLevel] ??
  FRIEND_TRANSFER_FEE_PERCENT_BY_ECONOMY_LEVEL[FEE_TABLE_MAX_LEVEL];

/**
 * Upgrade-based transfer limits, or null while GOLD_TRANSFER is locked
 * (economy level below the Coal Mine). Economy levels above the upgrade
 * table use the last tier.
 */
export const getFriendTransferLimits = (
  economyLevel: number,
): FriendTransferLimits | null => {
  if (!hasFeature({ economyLevel, fortLevel: 0 }, 'GOLD_TRANSFER')) {
    return null;
  }
  const tier =
    EconomyUpgrades[
      Math.min(Math.max(economyLevel, 0), EconomyUpgrades.length - 1)
    ];
  return {
    sendPerDay: BigInt(tier.goldTransferTx),
    receivePerDay: BigInt(tier.goldTransferRec),
    feePercent: feePercentForEconomyLevel(economyLevel),
  };
};

/**
 * Fee charged on a transfer of `amount` at the sender's economy level:
 * floor(amount * feePercent / 100), and 0 while GOLD_TRANSFER is locked.
 */
export const calculateFriendTransferFee = (
  amount: bigint,
  economyLevel: number,
): bigint => {
  const limits = getFriendTransferLimits(economyLevel);
  if (!limits) return BigInt(0);
  return (amount * BigInt(limits.feePercent)) / BigInt(100);
};

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
