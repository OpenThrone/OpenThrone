import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { createApiError } from '@/utils/api-error';

import {
  calculateTransferFee,
  canMakeTransfer,
  friendTransferCompleteConfig,
  getFriendTransferConfig,
  isValidTransferAmount,
} from './Config.service';

type TransactionClient = Prisma.TransactionClient;

// Extended bank history type for friend transfers
interface FriendTransferRecord {
  id: number;
  from_user_id: number;
  to_user_id: number;
  gold_amount: bigint;
  from_user_account_type: string;
  to_user_account_type: string;
  date_time: any;
  history_type: 'FRIEND_TRANSFER' | 'FRIEND_REQUEST';
  stats?: any;
}

// Extended bank history type for friend transfer requests
interface FriendTransferRequest {
  id: number;
  from_user_id: number;
  to_user_id: number;
  gold_amount: bigint;
  from_user_account_type: string;
  to_user_account_type: string;
  date_time: any;
  history_type: 'FRIEND_REQUEST';
  stats?: {
    transferType: 'FRIEND_REQUEST';
    friendshipId: number;
    senderNote?: string;
    expiresAt?: string;
    acceptedAt?: string;
    declinedAt?: string;
    declineReason?: string;
    fulfillerMessage?: string;
  };
}

const TransferParamsSchema = z.object({
  fromUserId: z.number().int().positive(),
  toUserId: z.number().int().positive(),
  amount: z.bigint().positive(),
  notes: z.string().optional(),
  friendshipId: z.number().int().positive().optional(),
});

const GoldRequestParamsSchema = z.object({
  fromUserId: z.number().int().positive(),
  toUserId: z.number().int().positive(),
  amount: z.bigint().positive(),
  notes: z.string().optional(),
});

const RespondToGoldRequestParamsSchema = z.object({
  requestId: z.number().int().positive(),
  action: z.enum(['accept', 'decline']),
  message: z.string().optional(),
});

const FriendTransferHistoryParamsSchema = z.object({
  userId: z.number().int().positive(),
  friendId: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
});

const CancelFriendTransferParamsSchema = z.object({
  transferId: z.number().int().positive(),
  fromUserId: z.number().int().positive(),
});

/**
 * Verifies that two users are friends
 * @param fromUserId - The ID of the first user
 * @param toUserId - The ID of the second user
 * @param tx - Transaction client
 * @returns The friendship record
 * @throws Error if users are not friends
 */
const verifyFriendship = async (
  fromUserId: number,
  toUserId: number,
  tx: TransactionClient,
) => {
  const friendship = await tx.social.findFirst({
    where: {
      OR: [
        { playerId: fromUserId, friendId: toUserId, status: 'accepted' },
        { playerId: toUserId, friendId: fromUserId, status: 'accepted' },
      ],
    },
  });

  if (!friendship) {
    throw createApiError('Users must be friends to perform this operation');
  }

  return friendship;
};

/**
 * Validates friend transfer parameters
 * @param fromUserId - The ID of the sender
 * @param toUserId - The ID of the receiver
 * @param amount - The transfer amount
 * @returns Validation result
 */
const validateFriendTransfer = async (
  fromUserId: number,
  toUserId: number,
  amount: bigint,
) => {
  const config = getFriendTransferConfig();

  // Check if feature is enabled
  if (!config.enabled) {
    return { valid: false, error: 'Friend transfers are currently disabled' };
  }

  // Validate amount
  if (!isValidTransferAmount(amount)) {
    return {
      valid: false,
      error: `Transfer amount must be between 1 and ${config.maxAmount} gold`,
    };
  }

  // Check if user can make transfer (cooldown)
  const lastTransfer = await prisma.bank_history.findFirst({
    where: {
      from_user_id: fromUserId,
      history_type: 'FRIEND_TRANSFER',
      date_time: {
        gte: new Date(Date.now() - friendTransferCompleteConfig.cooldownMs),
      },
    },
    orderBy: { date_time: 'desc' },
  });

  if (lastTransfer && !canMakeTransfer(lastTransfer.date_time)) {
    return {
      valid: false,
      error: 'You must wait before making another transfer',
    };
  }

  return { valid: true };
};

/**
 * Validates gold request parameters
 * @param fromUserId - The ID of the requester
 * @param toUserId - The ID of the requested user
 * @param amount - The request amount
 * @returns Validation result
 */
const validateGoldRequest = async (
  fromUserId: number,
  toUserId: number,
  amount: bigint,
) => {
  const config = getFriendTransferConfig();

  // Check if feature is enabled
  if (!config.enabled) {
    return { valid: false, error: 'Friend transfers are currently disabled' };
  }

  // Validate amount
  if (!isValidTransferAmount(amount)) {
    return {
      valid: false,
      error: `Request amount must be between 1 and ${config.maxAmount} gold`,
    };
  }

  // Check if user can make request (cooldown)
  const existingRequest = await prisma.bank_history.findFirst({
    where: {
      from_user_id: fromUserId,
      to_user_id: toUserId,
      history_type: 'FRIEND_REQUEST',
      date_time: {
        gte: new Date(Date.now() - friendTransferCompleteConfig.cooldownMs),
      },
    },
  });

  if (existingRequest) {
    return {
      valid: false,
      error: 'You must wait before making another request to this friend',
    };
  }

  return { valid: true };
};
/** Transfer gold to friend. */
export const transferGoldToFriend = async (params: {
  fromUserId: number;
  toUserId: number;
  amount: bigint;
  notes?: string;
  friendshipId?: number;
}) => {
  const validatedParams = TransferParamsSchema.parse(params);
  return await prisma.$transaction(async (tx: TransactionClient) => {
    // Verify friendship exists and is accepted
    const friendship = await verifyFriendship(
      validatedParams.fromUserId,
      validatedParams.toUserId,
      tx,
    );

    // Check transfer limits and validation
    const validation = (await validateFriendTransfer(
      validatedParams.fromUserId,
      validatedParams.toUserId,
      validatedParams.amount,
    )) as any;
    if (!validation.valid) {
      throw { message: validation.error } as any;
    }

    // Check sender's gold balance
    const sender = await tx.users.findUnique({
      where: { id: validatedParams.fromUserId },
    });

    if (!sender) {
      throw { message: 'Sender not found' } as any;
    }

    if ((BigInt as any)(sender.gold ?? 0) < validatedParams.amount) {
      throw { message: 'Insufficient gold for transfer' } as any;
    }

    // Calculate tax if enabled
    const taxAmount = calculateTransferFee(validatedParams.amount);
    const totalAmount = validatedParams.amount + taxAmount;

    // Update user gold balances
    await tx.users.update({
      where: { id: validatedParams.fromUserId },
      data: {
        gold: (BigInt as any)(sender.gold ?? 0) - totalAmount,
      } as any,
    });

    const receiver = await tx.users.findUnique({
      where: { id: validatedParams.toUserId },
    });

    if (!receiver) {
      throw { message: 'Receiver not found' } as any;
    }

    await tx.users.update({
      where: { id: validatedParams.toUserId },
      data: {
        gold: (BigInt as any)(receiver.gold ?? 0) + validatedParams.amount,
      } as any,
    });

    // Create bank history record for transfer
    const transferRecord = await tx.bank_history.create({
      data: {
        gold_amount: validatedParams.amount,
        from_user_id: validatedParams.fromUserId,
        from_user_account_type: 'HAND',
        to_user_id: validatedParams.toUserId,
        to_user_account_type: 'HAND',
        date_time: new Date(),
        history_type: 'FRIEND_TRANSFER',
        stats: {
          transferType: 'FRIEND_TRANSFER',
          friendshipId: (friendship as any).id,
          senderNote: validatedParams.notes,
          taxAmount: (taxAmount as any).toString(),
          totalAmount: (totalAmount as any).toString(),
        },
      } as any,
    });

    // Create bank history record for tax (if any)
    if (taxAmount > 0) {
      // Use configured system user id for tax receipts; database requires a non-null to_user_id
      const systemUserId = process.env.SYSTEM_USER_ID
        ? Number(process.env.SYSTEM_USER_ID)
        : 0;
      await tx.bank_history.create({
        data: {
          gold_amount: taxAmount,
          from_user_id: validatedParams.fromUserId,
          from_user_account_type: 'HAND',
          to_user_id: systemUserId,
          to_user_account_type: 'SYSTEM',
          date_time: new Date(),
          history_type: 'FRIEND_TRANSFER',
          stats: {
            transferType: 'FRIEND_TRANSFER_TAX',
            friendshipId: (friendship as any).id,
            originalAmount: (validatedParams.amount as any).toString(),
            taxAmount: (taxAmount as any).toString(),
          },
        } as any,
      });
    }

    return { success: true, transferId: transferRecord.id };
  });
};

/**
 * Creates a gold transfer request from one user to another
 * @param params - Request parameters
 * @returns Promise with request result
 */
export const createGoldRequest = async (params: {
  fromUserId: number;
  toUserId: number;
  amount: bigint;
  notes?: string;
}) => {
  const validatedParams = GoldRequestParamsSchema.parse(params);
  return await prisma.$transaction(async (tx: TransactionClient) => {
    // Verify friendship exists and is accepted
    const friendship = await verifyFriendship(
      validatedParams.fromUserId,
      validatedParams.toUserId,
      tx,
    );

    // Check request validation
    const validation = (await validateGoldRequest(
      validatedParams.fromUserId,
      validatedParams.toUserId,
      validatedParams.amount,
    )) as any;
    if (!validation.valid) {
      throw { message: validation.error } as any;
    }

    // Create bank history record for request
    const config = getFriendTransferConfig();
    const requestRecord = await tx.bank_history.create({
      data: {
        gold_amount: validatedParams.amount,
        from_user_id: validatedParams.fromUserId,
        from_user_account_type: 'REQUEST',
        to_user_id: validatedParams.toUserId,
        to_user_account_type: 'REQUEST',
        date_time: new Date(),
        history_type: 'FRIEND_REQUEST',
        stats: {
          transferType: 'FRIEND_REQUEST',
          friendshipId: (friendship as any).id,
          senderNote: validatedParams.notes,
          expiresAt: new Date(
            Date.now() + config.cooldownHours * 60 * 60 * 1000,
          ).toISOString(),
        },
      } as any,
    });

    return { success: true, requestId: requestRecord.id };
  });
};

/**
 * Responds to a gold transfer request
 * @param params - Response parameters
 * @returns Promise with response result
 */
export const respondToGoldRequest = async (params: {
  requestId: number;
  action: 'accept' | 'decline';
  message?: string;
}) => {
  const validatedParams = RespondToGoldRequestParamsSchema.parse(params);
  return await prisma.$transaction(async (tx: TransactionClient) => {
    // Find the request record
    const request = await (tx.bank_history as any).findUnique({
      where: { id: validatedParams.requestId },
      include: {
        from_user: {
          select: {
            id: true,
            display_name: true,
          },
        },
        to_user: {
          select: {
            id: true,
            display_name: true,
          },
        },
      },
    });

    if (!request || request.history_type !== 'FRIEND_REQUEST') {
      throw { message: 'Invalid request' } as any;
    }

    if (validatedParams.action === 'accept') {
      // Fulfill the request using transfer logic
      await transferGoldToFriend({
        fromUserId: request.to_user_id,
        toUserId: request.from_user_id,
        amount: request.gold_amount,
        notes: `Accepted request: ${request.stats && typeof request.stats === 'object' && 'senderNote' in request.stats ? request.stats.senderNote : ''}`,
        friendshipId:
          request.stats &&
          typeof request.stats === 'object' &&
          'friendshipId' in request.stats
            ? request.stats.friendshipId
            : undefined,
      });

      // Update request status
      await tx.bank_history.update({
        where: { id: validatedParams.requestId },
        data: {
          stats: request.stats
            ? {
                ...request.stats,
                transferType: 'FRIEND_REQUEST_FULFILLED',
                acceptedAt: new Date().toISOString(),
                fulfillerMessage: validatedParams.message,
              }
            : {
                transferType: 'FRIEND_REQUEST_FULFILLED',
                acceptedAt: new Date().toISOString(),
                fulfillerMessage: validatedParams.message,
              },
        } as any,
      });
    } else {
      // Decline the request
      await tx.bank_history.update({
        where: { id: validatedParams.requestId },
        data: {
          stats: request.stats
            ? {
                ...request.stats,
                transferType: 'FRIEND_REQUEST_DECLINED',
                declinedAt: new Date().toISOString(),
                declineReason: validatedParams.message,
              }
            : {
                transferType: 'FRIEND_REQUEST_DECLINED',
                declinedAt: new Date().toISOString(),
                declineReason: validatedParams.message,
              },
        } as any,
      });
    }

    return { success: true };
  });
};

/**
 * Gets friend transfer history for a user
 * @param params - History parameters
 * @returns Promise with history result
 */
export const getFriendTransferHistory = async (params: {
  userId: number;
  friendId?: number;
  page?: number;
  limit?: number;
}) => {
  const validatedParams = FriendTransferHistoryParamsSchema.parse(params);
  const where: any = {
    history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
    OR: [
      { from_user_id: validatedParams.userId },
      { to_user_id: validatedParams.userId },
    ],
  };

  if (validatedParams.friendId) {
    where.OR = [
      {
        from_user_id: validatedParams.userId,
        to_user_id: validatedParams.friendId,
      },
      {
        from_user_id: validatedParams.friendId,
        to_user_id: validatedParams.userId,
      },
    ];
  }

  const [transfers, total] = await Promise.all([
    prisma.bank_history.findMany({
      where,
      include: {
        from_user: {
          select: {
            id: true,
            display_name: true,
            race: true,
            class: true,
          },
        },
        to_user: {
          select: {
            id: true,
            display_name: true,
            race: true,
            class: true,
          },
        },
      },
      orderBy: { date_time: 'desc' },
      skip: validatedParams.page
        ? (validatedParams.page - 1) * (validatedParams.limit || 20)
        : 0,
      take: validatedParams.limit || 20,
    }),
    prisma.bank_history.count({ where }),
  ]);

  return { transfers, total };
};

/**
 * Gets pending friend transfer requests for a user
 * @param userId - The ID of the user to get requests for
 * @returns Array of pending transfer requests
 */
export const getPendingFriendTransfers = async (userId: number) => {
  const requests = await prisma.bank_history.findMany({
    where: {
      to_user_id: userId,
      history_type: 'FRIEND_REQUEST',
      stats: {
        path: ['transferType'],
        equals: 'FRIEND_REQUEST',
      },
      date_time: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    },
    include: {
      from_user: {
        select: {
          id: true,
          display_name: true,
          race: true,
          class: true,
        },
      },
    },
    orderBy: { date_time: 'desc' },
  });

  return requests.map((request) => ({
    id: request.id,
    from_user_id: request.from_user_id,
    to_user_id: request.to_user_id,
    amount: request.gold_amount,
    message:
      request.stats &&
      typeof request.stats === 'object' &&
      'senderNote' in request.stats
        ? request.stats.senderNote
        : undefined,
    status: 'PENDING' as const,
    created_at: request.date_time,
    from_user: request.from_user,
    expires_at:
      request.stats &&
      typeof request.stats === 'object' &&
      'expiresAt' in request.stats
        ? new Date(request.stats.expiresAt)
        : null,
  }));
};

/**
 * Cancels a pending friend transfer request
 * @param transferId - The ID of the transfer request to cancel
 * @param fromUserId - The ID of the user who created the request
 * @returns The updated transfer record
 * @throws Error if transfer not found, not pending, or not authorized
 */
export const cancelFriendTransfer = async (
  transferId: number,
  fromUserId: number,
) => {
  const validatedParams = CancelFriendTransferParamsSchema.parse({
    transferId,
    fromUserId,
  });
  return await prisma.$transaction(async (tx: TransactionClient) => {
    const request = await tx.bank_history.findUnique({
      where: { id: validatedParams.transferId },
    });

    if (!request) {
      throw { message: 'Transfer request not found' } as any;
    }

    if (request.from_user_id !== validatedParams.fromUserId) {
      throw {
        message: 'You are not authorized to cancel this transfer',
      } as any;
    }

    if (
      request.history_type !== 'FRIEND_REQUEST' ||
      (request.stats &&
      typeof request.stats === 'object' &&
      'transferType' in request.stats
        ? (request.stats as any).transferType !== 'FRIEND_REQUEST'
        : true)
    ) {
      throw { message: 'Transfer request is not cancellable' } as any;
    }

    // Update request status
    const updatedRequest = await tx.bank_history.update({
      where: { id: validatedParams.transferId },
      // Cast update payload to any to avoid strict Prisma input typing during migration
      data: {
        stats: {
          ...(request.stats as any),
          transferType: 'FRIEND_REQUEST_CANCELLED',
          cancelledAt: new Date().toISOString(),
        },
      } as any,
    });
    return {
      id: updatedRequest.id,
      from_user_id: updatedRequest.from_user_id,
      to_user_id: updatedRequest.to_user_id,
      amount: updatedRequest.gold_amount,
      message:
        updatedRequest.stats &&
        typeof updatedRequest.stats === 'object' &&
        'senderNote' in updatedRequest.stats
          ? (updatedRequest.stats as any).senderNote
          : undefined,
      status: 'CANCELLED' as const,
      created_at: updatedRequest.date_time,
      cancelled_at: new Date(),
    };
  });
};
