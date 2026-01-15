import { z } from 'zod';

// Friend transfer configuration schema
const friendTransferConfigSchema = z.object({
  NEXT_PUBLIC_ENABLE_FRIEND_TRANSFER: z.boolean().default(true),
  FRIEND_TRANSFER_MAX_AMOUNT: z
    .string()
    .transform((val) => BigInt(val))
    .default('1000000'),
  FRIEND_TRANSFER_COOLDOWN_HOURS: z.coerce.number().int().min(1).default(24),
  FRIEND_TRANSFER_FEE_PERCENTAGE: z.coerce.number().min(0).max(100).default(5),
});

// Friend transfer configuration type
export type FriendTransferConfig = z.infer<typeof friendTransferConfigSchema>;

// Friend transfer configuration with validation
export const friendTransferConfig = friendTransferConfigSchema.parse(
  process.env,
);

/**
 * Gets friend transfer configuration settings
 * @returns Friend transfer configuration object
 */
export const getFriendTransferConfig = () => {
  return {
    enabled: friendTransferConfig.NEXT_PUBLIC_ENABLE_FRIEND_TRANSFER,
    maxAmount: friendTransferConfig.FRIEND_TRANSFER_MAX_AMOUNT,
    cooldownHours: friendTransferConfig.FRIEND_TRANSFER_COOLDOWN_HOURS,
    feePercentage: friendTransferConfig.FRIEND_TRANSFER_FEE_PERCENTAGE,
  };
};

/**
 * Checks if friend transfer feature is enabled
 * @returns True if friend transfer is enabled, false otherwise
 */
export const isFriendTransferEnabled = () => {
  return friendTransferConfig.NEXT_PUBLIC_ENABLE_FRIEND_TRANSFER;
};

/**
 * Gets the maximum transfer amount allowed
 * @returns Maximum transfer amount as bigint
 */
export const getMaxTransferAmount = () => {
  return friendTransferConfig.FRIEND_TRANSFER_MAX_AMOUNT;
};

/**
 * Gets the cooldown period in hours between transfers
 * @returns Cooldown period in hours
 */
export const getTransferCooldownHours = () => {
  return friendTransferConfig.FRIEND_TRANSFER_COOLDOWN_HOURS;
};

/**
 * Gets the fee percentage applied to friend transfers
 * @returns Fee percentage as number
 */
export const getTransferFeePercentage = () => {
  return friendTransferConfig.FRIEND_TRANSFER_FEE_PERCENTAGE;
};

/**
 * Calculates the fee amount for a given transfer amount
 * @param amount - The transfer amount
 * @returns The calculated fee amount
 */
export const calculateTransferFee = (amount: bigint) => {
  const feePercentage = getTransferFeePercentage();
  return (amount * BigInt(feePercentage)) / BigInt(100);
};

/**
 * Validates if a transfer amount is within allowed limits
 * @param amount - The transfer amount to validate
 * @returns True if amount is valid, false otherwise
 */
export const isValidTransferAmount = (amount: bigint) => {
  const maxAmount = getMaxTransferAmount();
  return amount > BigInt(0) && amount <= maxAmount;
};

/**
 * Gets the minimum time (in milliseconds) that must pass between transfers
 * @returns Minimum time between transfers in milliseconds
 */
export const getTransferCooldownMs = () => {
  const cooldownHours = getTransferCooldownHours();
  return cooldownHours * 60 * 60 * 1000; // Convert hours to milliseconds
};

/**
 * Checks if a user can make a transfer based on cooldown period
 * @param lastTransferTime - The timestamp of the last transfer
 * @returns True if user can transfer, false otherwise
 */
export const canMakeTransfer = (lastTransferTime: Date | null) => {
  if (!lastTransferTime) return true;

  const cooldownMs = getTransferCooldownMs();
  const timeSinceLastTransfer = Date.now() - lastTransferTime.getTime();

  return timeSinceLastTransfer >= cooldownMs;
};

/**
 * Gets all configuration settings for friend transfer feature
 * @returns Complete friend transfer configuration
 */
export const getCompleteFriendTransferConfig = () => {
  return {
    enabled: isFriendTransferEnabled(),
    maxAmount: getMaxTransferAmount(),
    cooldownHours: getTransferCooldownHours(),
    cooldownMs: getTransferCooldownMs(),
    feePercentage: getTransferFeePercentage(),
  };
};

// Export the complete config object for direct use
export const friendTransferCompleteConfig = getCompleteFriendTransferConfig();
