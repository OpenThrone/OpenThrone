import { z } from 'zod';

import {
  calculateFriendTransferFee,
  FRIEND_TRANSFER_ATTACK_BLOCK_HOURS,
  FRIEND_TRANSFER_DAILY_RECEIVED_CAP,
  FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS,
  FRIEND_TRANSFER_NOTE_MAX_LENGTH,
  getFriendTransferLimits,
} from '@/constants/FriendTransfer';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { ensureActiveEra } from '@/services/Era.service';
import { getActiveAccountStatus } from '@/services/User.service';
import { createApiError } from '@/utils/api-error';

import {
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

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ACCOUNT_AGE_MS =
  FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
const ATTACK_BLOCK_MS = FRIEND_TRANSFER_ATTACK_BLOCK_HOURS * 60 * 60 * 1000;

/** The users columns the upgrade-based transfer rules are enforced on. */
interface TransferParticipant {
  id: number;
  race: string;
  fort_level: number;
  economy_level: number;
  created_at: Date | null;
}

/** Reads both transfer participants after their user rows are locked. */
const getTransferParticipants = async (
  fromUserId: number,
  toUserId: number,
  tx: TransactionClient,
): Promise<Map<number, TransferParticipant>> => {
  const rows = await tx.users.findMany({
    where: { id: { in: [fromUserId, toUserId] } },
    select: {
      id: true,
      race: true,
      fort_level: true,
      economy_level: true,
      created_at: true,
    },
  });
  return new Map(rows.map((row) => [row.id, row as TransferParticipant]));
};

/** The player's upgrade-based transfer limits, or null while locked. */
const limitsOf = (participant: { economy_level: number } | undefined | null) =>
  participant ? getFriendTransferLimits(participant.economy_level) : null;

/** Throws unless the account is old enough to send or receive transfers. */
const assertTransferAccountAge = (
  participant: TransferParticipant,
  role: 'send' | 'receive',
) => {
  const createdAt = participant.created_at;
  if (!createdAt || Date.now() - createdAt.getTime() < MIN_ACCOUNT_AGE_MS) {
    throw createApiError(
      role === 'send'
        ? `Your account must be at least ${FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS} days old to send gold transfers`
        : `This player must be at least ${FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS} days old to receive gold transfers`,
    );
  }
};

/** Finds an attack in either direction inside the combat-block window. */
const findRecentAttack = (
  fromUserId: number,
  toUserId: number,
  tx: TransactionClient,
) =>
  tx.attack_log.findFirst({
    where: {
      timestamp: { gte: new Date(Date.now() - ATTACK_BLOCK_MS) },
      OR: [
        { attacker_id: fromUserId, defender_id: toUserId },
        { attacker_id: toUserId, defender_id: fromUserId },
      ],
    },
    select: { id: true },
  });

/** Player-facing refusal when either side fought the other recently. */
const FRIEND_TRANSFER_ATTACK_BLOCK_MESSAGE =
  "You can't send gold to a player you've fought in the last 24 hours";

const NoteSchema = z
  .string()
  .max(FRIEND_TRANSFER_NOTE_MAX_LENGTH, {
    message: `Notes must be ${FRIEND_TRANSFER_NOTE_MAX_LENGTH} characters or fewer`,
  })
  .optional();

const TransferParamsSchema = z.object({
  fromUserId: z.number().int().positive(),
  toUserId: z.number().int().positive(),
  amount: z.bigint().positive(),
  notes: NoteSchema,
  friendshipId: z.number().int().positive().optional(),
});

const GoldRequestParamsSchema = z.object({
  fromUserId: z.number().int().positive(),
  toUserId: z.number().int().positive(),
  amount: z.bigint().positive(),
  notes: NoteSchema,
});

const RespondToGoldRequestParamsSchema = z.object({
  actorUserId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  action: z.enum(['accept', 'decline']),
  message: NoteSchema,
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
        {
          playerId: fromUserId,
          friendId: toUserId,
          relationshipType: 'FRIEND',
          status: 'accepted',
        },
        {
          playerId: toUserId,
          friendId: fromUserId,
          relationshipType: 'FRIEND',
          status: 'accepted',
        },
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
  tx: TransactionClient,
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
  const lastTransfer = await tx.bank_history.findFirst({
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
  tx: TransactionClient,
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

  // Locked players cannot create gold requests either: both the requester and
  // the friend who would pay need the Coal Mine unlocked (#205).
  const participants = await getTransferParticipants(fromUserId, toUserId, tx);
  if (!limitsOf(participants.get(fromUserId))) {
    return { valid: false, error: 'Gold transfers unlock with the Coal Mine' };
  }
  if (!limitsOf(participants.get(toUserId))) {
    return {
      valid: false,
      error: 'This player needs the Coal Mine to send gold transfers',
    };
  }
  // Both accounts must be old enough, as they would be when the request is paid.
  const isOldEnough = (createdAt: Date | null | undefined) =>
    !!createdAt && Date.now() - createdAt.getTime() >= MIN_ACCOUNT_AGE_MS;
  if (!isOldEnough(participants.get(fromUserId)?.created_at)) {
    return {
      valid: false,
      error: `Your account must be at least ${FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS} days old to request gold`,
    };
  }
  if (!isOldEnough(participants.get(toUserId)?.created_at)) {
    return {
      valid: false,
      error: `This player must be at least ${FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS} days old to send gold transfers`,
    };
  }
  if (await findRecentAttack(fromUserId, toUserId, tx)) {
    return { valid: false, error: FRIEND_TRANSFER_ATTACK_BLOCK_MESSAGE };
  }

  // Check if user can make request (cooldown)
  const existingRequest = await tx.bank_history.findFirst({
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
const transferGoldWithinTransaction = async (
  tx: TransactionClient,
  params: {
    fromUserId: number;
    toUserId: number;
    amount: bigint;
    notes?: string;
    friendshipId?: number;
  },
  requestExpiresAt?: number,
) => {
  const validatedParams = TransferParamsSchema.parse(params);
  // Ordered row locks serialize cooldown/balance checks and prevent opposing transfers
  // from acquiring account locks in different orders.
  const firstId = Math.min(
    validatedParams.fromUserId,
    validatedParams.toUserId,
  );
  const secondId = Math.max(
    validatedParams.fromUserId,
    validatedParams.toUserId,
  );
  await tx.$queryRaw`SELECT id FROM users WHERE id IN (${firstId}, ${secondId}) ORDER BY id FOR UPDATE`;
  if (requestExpiresAt !== undefined && requestExpiresAt <= Date.now()) {
    throw createApiError('Request has expired');
  }
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
    tx,
  )) as any;
  if (!validation.valid) {
    throw { message: validation.error } as any;
  }

  // Recipients who cannot play (banned, suspended, on vacation, closed) cannot receive gifts.
  const recipientStatus = await getActiveAccountStatus(
    validatedParams.toUserId,
    tx,
  );
  if (recipientStatus) {
    throw createApiError('This player cannot receive gold right now');
  }

  // Upgrade-based rules (#205): both players need GOLD_TRANSFER unlocked, both
  // accounts must be old enough, and they must not have fought each other
  // recently. Rows are read after the locks above.
  const participants = await getTransferParticipants(
    validatedParams.fromUserId,
    validatedParams.toUserId,
    tx,
  );
  const senderRow = participants.get(validatedParams.fromUserId);
  const recipientRow = participants.get(validatedParams.toUserId);
  const senderLimits = limitsOf(senderRow);
  const recipientLimits = limitsOf(recipientRow);

  if (!senderRow || !senderLimits) {
    throw createApiError('Gold transfers unlock with the Coal Mine');
  }
  if (!recipientRow || !recipientLimits) {
    throw createApiError(
      'This player needs the Coal Mine to receive gold transfers',
    );
  }
  assertTransferAccountAge(senderRow, 'send');
  assertTransferAccountAge(recipientRow, 'receive');
  if (
    await findRecentAttack(
      validatedParams.fromUserId,
      validatedParams.toUserId,
      tx,
    )
  ) {
    throw createApiError(FRIEND_TRANSFER_ATTACK_BLOCK_MESSAGE);
  }

  // Per-recipient rolling daily cap across all senders. The recipient row is
  // locked above, so concurrent gifts to the same player serialize here.
  const received = await tx.bank_history.aggregate({
    _sum: { gold_amount: true },
    where: {
      to_user_id: validatedParams.toUserId,
      to_user_account_type: 'HAND',
      history_type: 'FRIEND_TRANSFER',
      date_time: { gte: new Date(Date.now() - DAY_MS) },
    },
  });
  const receivedToday = BigInt(received?._sum?.gold_amount ?? 0);
  if (
    receivedToday + validatedParams.amount >
    FRIEND_TRANSFER_DAILY_RECEIVED_CAP
  ) {
    throw createApiError(
      'This player has reached the daily limit for receiving gold',
    );
  }
  // The recipient's economy tier may cap receiving below the global limit.
  if (receivedToday + validatedParams.amount > recipientLimits.receivePerDay) {
    throw createApiError(
      'This player has reached the daily limit for receiving gold',
    );
  }

  // The sender's rolling daily cap for the amount they may send (excluding
  // SYSTEM tax rows, which book the fee, not the gift).
  const sent = await tx.bank_history.aggregate({
    _sum: { gold_amount: true },
    where: {
      from_user_id: validatedParams.fromUserId,
      from_user_account_type: 'HAND',
      to_user_account_type: 'HAND',
      history_type: 'FRIEND_TRANSFER',
      date_time: { gte: new Date(Date.now() - DAY_MS) },
    },
  });
  const sentToday = BigInt(sent?._sum?.gold_amount ?? 0);
  if (sentToday + validatedParams.amount > senderLimits.sendPerDay) {
    throw createApiError('You have reached your daily limit for sending gold');
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

  // Calculate tax from the sender's economy tier (#205)
  const taxAmount = calculateFriendTransferFee(
    validatedParams.amount,
    senderRow.economy_level,
  );
  const totalAmount = validatedParams.amount + taxAmount;

  if (BigInt(sender.gold ?? 0) < totalAmount) {
    throw createApiError('Insufficient gold for transfer');
  }

  // Update user gold balances
  await tx.users.update({
    where: { id: validatedParams.fromUserId },
    data: {
      gold: { decrement: totalAmount },
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
      gold: { increment: validatedParams.amount },
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
};

/** Transfer gold and history together after serializing participant balances. */
export const transferGoldToFriend = async (
  params: Parameters<typeof transferGoldWithinTransaction>[1],
) =>
  prisma.$transaction(
    (tx: TransactionClient) => transferGoldWithinTransaction(tx, params),
    { isolationLevel: 'ReadCommitted' },
  );

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
    // Serialize the requester before reading cooldown history on this transaction.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${validatedParams.fromUserId} FOR UPDATE`;
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
      tx,
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
  actorUserId: number;
  requestId: number;
  action: 'accept' | 'decline';
  message?: string;
}) => {
  const validatedParams = RespondToGoldRequestParamsSchema.parse(params);
  return await prisma.$transaction(
    async (tx: TransactionClient) => {
      // All responses and cancellation must lock the request before checking its state.
      await tx.$queryRaw`SELECT id FROM bank_history WHERE id = ${validatedParams.requestId} FOR UPDATE`;
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

      if (request.to_user_id !== validatedParams.actorUserId) {
        throw createApiError(
          'You are not authorized to respond to this request',
        );
      }
      const { stats } = request;
      if (
        !stats ||
        typeof stats !== 'object' ||
        stats.transferType !== 'FRIEND_REQUEST'
      ) {
        throw createApiError('Request is no longer pending');
      }
      const expiresAt =
        typeof stats.expiresAt === 'string' ? Date.parse(stats.expiresAt) : NaN;
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw createApiError('Request has expired');
      }

      if (validatedParams.action === 'accept') {
        // Fulfill the request using transfer logic
        await transferGoldWithinTransaction(
          tx,
          {
            fromUserId: request.to_user_id,
            toUserId: request.from_user_id,
            amount: request.gold_amount,
            // Older requests may predate the note limit; keep the stored note bounded.
            notes:
              `Accepted request: ${request.stats && typeof request.stats === 'object' && 'senderNote' in request.stats ? request.stats.senderNote : ''}`.slice(
                0,
                FRIEND_TRANSFER_NOTE_MAX_LENGTH,
              ),
            friendshipId:
              request.stats &&
              typeof request.stats === 'object' &&
              'friendshipId' in request.stats
                ? request.stats.friendshipId
                : undefined,
          },
          expiresAt,
        );

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
    },
    { isolationLevel: 'ReadCommitted' },
  );
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
  const era = await ensureActiveEra();
  const where: Prisma.bank_historyWhereInput = {
    history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
    date_time: { gte: era.startDate },
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
  return await prisma.$transaction(
    async (tx: TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM bank_history WHERE id = ${validatedParams.transferId} FOR UPDATE`;
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
    },
    { isolationLevel: 'ReadCommitted' },
  );
};

/**
 * Gets the signed-in player's transfer standing for the limits endpoint:
 * whether gold transfers are unlocked, the tier limits and fee, and the
 * rolling-24h totals already sent and received (#205).
 * @param userId - The ID of the signed-in user
 */
export const getFriendTransferStatus = async (userId: number) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      race: true,
      fort_level: true,
      economy_level: true,
    },
  });
  if (!user) {
    throw createApiError('Player not found', 404);
  }

  const limits = limitsOf(user);
  const since = new Date(Date.now() - DAY_MS);
  // Sent total excludes the SYSTEM tax rows: they book the fee, not the gift.
  const [sent, received] = await Promise.all([
    prisma.bank_history.aggregate({
      _sum: { gold_amount: true },
      where: {
        from_user_id: userId,
        from_user_account_type: 'HAND',
        to_user_account_type: 'HAND',
        history_type: 'FRIEND_TRANSFER',
        date_time: { gte: since },
      },
    }),
    prisma.bank_history.aggregate({
      _sum: { gold_amount: true },
      where: {
        to_user_id: userId,
        to_user_account_type: 'HAND',
        history_type: 'FRIEND_TRANSFER',
        date_time: { gte: since },
      },
    }),
  ]);

  return {
    unlocked: limits !== null,
    // Plain integer strings so clients can parse them with BigInt().
    sendPerDay: (limits?.sendPerDay ?? BigInt(0)).toString(),
    receivePerDay: (limits?.receivePerDay ?? BigInt(0)).toString(),
    feePercent: limits?.feePercent ?? 0,
    sentToday: BigInt(sent?._sum?.gold_amount ?? 0).toString(),
    receivedToday: BigInt(received?._sum?.gold_amount ?? 0).toString(),
  };
};
