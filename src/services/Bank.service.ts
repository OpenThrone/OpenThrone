import { stringifyObj } from '@/utils/numberFormatting';
import prisma from '@/lib/prisma';
import { Prisma, PrismaClient } from '@prisma/client'; // Import Prisma types

// Define the type for the transaction client
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Deposits gold from a user's hand into their bank account within a transaction.
 * Creates a corresponding bank history record.
 * @param userId - The ID of the user making the deposit.
 * @param depositAmount - The amount of gold to deposit (as a bigint).
 * @returns The updated user object with stringified BigInt fields.
 * @throws Error if user not found or insufficient gold.
 */
export const deposit = async (userId: number, depositAmount: bigint) => {
  return await prisma.$transaction(async (tx: TransactionClient) => {
    const user = await tx.users.findUnique({ where: { id: userId } });

    if (!user) throw new Error('User not found');
    // Ensure user.gold is treated as BigInt for comparison
    if (depositAmount > BigInt(user.gold ?? 0)) throw new Error('Not enough gold for deposit');

    const updatedUser = await tx.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold ?? 0) - depositAmount,
        gold_in_bank: BigInt(user.gold_in_bank ?? 0) + depositAmount,
      },
    });

    await tx.bank_history.create({
      data: {
        gold_amount: depositAmount,
        from_user_id: userId,
        from_user_account_type: 'HAND',
        to_user_id: userId,
        to_user_account_type: 'BANK',
        date_time: new Date(),
        history_type: 'PLAYER_TRANSFER',
      },
    });

    // Stringify BigInts before returning for API compatibility if needed
    return stringifyObj(updatedUser);
  });
};

/**
 * Withdraws gold from a user's bank account into their hand within a transaction.
 * Creates a corresponding bank history record.
 * @param userId - The ID of the user making the withdrawal.
 * @param withdrawAmount - The amount of gold to withdraw (as a bigint).
 * @returns The updated user object.
 * @throws Error if user not found or insufficient gold in bank.
 */
export const withdraw = async (userId: number, withdrawAmount: bigint) => {
  return await prisma.$transaction(async (tx: TransactionClient) => {
    const user = await tx.users.findUnique({ where: { id: userId } });

    if (!user) throw new Error('User not found');
    // Ensure user.gold_in_bank is treated as BigInt
    if (withdrawAmount > BigInt(user.gold_in_bank ?? 0)) throw new Error('Not enough gold for withdrawal');

    const updatedUser = await tx.users.update({
      where: { id: userId },
      data: {
        gold: BigInt(user.gold ?? 0) + withdrawAmount,
        gold_in_bank: BigInt(user.gold_in_bank ?? 0) - withdrawAmount,
      },
    });

    await tx.bank_history.create({
      data: {
        gold_amount: withdrawAmount,
        from_user_id: userId,
        from_user_account_type: 'BANK',
        to_user_id: userId,
        to_user_account_type: 'HAND',
        date_time: new Date(),
        history_type: 'PLAYER_TRANSFER',
      },
    });

    return updatedUser; // Return raw user object, stringify in API route if needed
  });
};

/**
 * Retrieves the deposit history for a specific user within the last 24 hours.
 * @param userId - The ID of the user whose deposit history to retrieve.
 * @returns An array of bank history records representing deposits.
 */
export const getDepositHistory = async (userId: number) => {
  return await prisma.bank_history.findMany({
    where: {
      from_user_id: userId,
      to_user_id: userId,
      from_user_account_type: 'HAND',
      to_user_account_type: 'BANK',
      history_type: 'PLAYER_TRANSFER',
      date_time: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      },
    },
    orderBy: {
      date_time: 'asc',
    },
  });
};

/**
 * Retrieves paginated bank history records based on specified conditions.
 * @param conditions - An array of Prisma query conditions (e.g., [{ user_id: 1 }, { history_type: 'ECONOMY' }]).
 * @param limit - The maximum number of records to return (default: 10).
 * @param skip - The number of records to skip for pagination (default: 0).
 * @returns An object containing the history rows and the total count of matching records.
 */
export const getBankHistory = async (conditions: Prisma.bank_historyWhereInput[], limit: number = 10, skip: number = 0) => {
  // Combine conditions using AND logic
  const whereClause: Prisma.bank_historyWhereInput = { AND: conditions };

  const total = await prisma.bank_history.count({
    where: whereClause,
  });

  const rows = await prisma.bank_history.findMany({
    where: whereClause,
    take: limit,
    skip: skip,
    orderBy: {
      date_time: 'desc',
    },
  });

  return { rows, total };
};