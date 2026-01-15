import { z } from 'zod';

import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

import {
  cancelFriendTransfer,
  createGoldRequest,
  getFriendTransferHistory,
  getPendingFriendTransfers,
  respondToGoldRequest,
  transferGoldToFriend,
} from './FriendTransfer.service';

// Type definitions for social operations
export interface AddSocialData {
  friendId: number;
  relationshipType: 'FRIEND' | 'ENEMY';
}

export interface RemoveSocialData {
  friendId: number;
  relationshipType: 'FRIEND' | 'ENEMY';
}

export interface EndRelationshipData {
  friendId: number;
}

export interface RespondToRequestData {
  requestId: number;
  action: 'accept' | 'decline';
}

export interface GetRelationshipData {
  userId: number;
  targetUserId: number;
}

export interface ListSocialData {
  type: 'FRIEND' | 'ENEMY' | 'REQUESTS';
  limit?: number;
  playerId?: number;
}

export interface GetTopSocialData {
  type: 'FRIEND' | 'ENEMY';
}

export interface GoldRequestData {
  friendId: number;
  amount: bigint;
  notes?: string;
}

export interface GoldRequestResponseData {
  requestId: number;
  action: 'accept' | 'decline';
  message?: string;
}

export interface SocialConnection {
  id: number;
  playerId: number;
  friendId: number;
  relationshipType: string;
  requestDate: Date;
  acceptanceDate: Date | null;
  endDate: Date | null;
  status: string;
  friend: {
    id: number;
    display_name: string;
    race: string;
    class: string;
    avatar: string | null;
    last_active: Date | null;
  };
}

export interface RelationshipInfo {
  relationship: any;
  canInteract: boolean;
  availableActions: string[];
}

// Zod schemas for validation
const AddSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY']),
});

const RemoveSocialSchema = z.object({
  friendId: z.number().int(),
  relationshipType: z.enum(['FRIEND', 'ENEMY']),
});

const EndRelationshipSchema = z.object({
  friendId: z.number().int(),
});

const RespondToRequestSchema = z.object({
  requestId: z.number().int(),
  action: z.enum(['accept', 'decline']),
});

const GetRelationshipSchema = z.object({
  userId: z.coerce.number().int(),
  targetUserId: z.coerce.number().int(),
});

const ListSocialSchema = z.object({
  type: z.enum(['FRIEND', 'ENEMY', 'REQUESTS']),
  limit: z.coerce.number().int().positive().max(100).optional(),
  playerId: z.coerce.number().int().optional(),
});

const GetTopSocialSchema = z.object({
  type: z.enum(['FRIEND', 'ENEMY']),
});

const GoldRequestSchema = z.object({
  friendId: z.number().int(),
  amount: z.string().transform((val) => BigInt(val)),
  notes: z.string().optional(),
});

const GoldRequestResponseSchema = z.object({
  requestId: z.number().int(),
  action: z.enum(['accept', 'decline']),
  message: z.string().optional(),
});

export class SocialService {
  /**
   * Validates that a user can add a relationship with another user
   */
  private static async validateAddRelationship(
    playerId: number,
    friendId: number,
  ) {
    // Check if user is trying to add relationship with themselves
    if (playerId === friendId) {
      throw new Error('Cannot create relationship with yourself');
    }

    // Check if relationship already exists
    const existingRelationship = await prisma.social.findFirst({
      where: {
        OR: [
          {
            AND: [{ playerId }, { friendId }],
          },
          {
            AND: [{ playerId: friendId }, { friendId: playerId }],
          },
        ],
      },
    });

    if (existingRelationship) {
      if (existingRelationship.status === 'requested') {
        throw new Error(
          `A ${existingRelationship.relationshipType.toLowerCase()} request is already pending between you and this user.`,
        );
      } else if (existingRelationship.status === 'accepted') {
        throw new Error(
          `You already have an active ${existingRelationship.relationshipType.toLowerCase()} relationship with this user.`,
        );
      } else {
        throw new Error(
          `A ${existingRelationship.relationshipType.toLowerCase()} relationship already exists with this user.`,
        );
      }
    }

    // Check if target user exists
    const targetUser = await prisma.users.findUnique({
      where: { id: friendId },
      select: { id: true, display_name: true },
    });

    if (!targetUser) {
      throw new Error('Target user not found');
    }
  }

  /**
   * Adds a new social relationship (FRIEND or ENEMY)
   */
  static async addRelationship(playerId: number, data: AddSocialData) {
    const validatedData = AddSocialSchema.parse(data);

    try {
      await this.validateAddRelationship(playerId, validatedData.friendId);

      const relationship = await prisma.social.create({
        data: {
          playerId,
          friendId: validatedData.friendId,
          relationshipType: validatedData.relationshipType,
          status: 'requested',
          requestDate: new Date(),
        },
      });

      return {
        message: `${validatedData.relationshipType} request sent successfully`,
        relationshipType: validatedData.relationshipType,
        relationship,
      };
    } catch (error: any) {
      logError('Error adding social relationship', {
        playerId,
        friendId: validatedData.friendId,
        error,
      });
      throw error;
    }
  }

  /**
   * Removes a social relationship (typically outgoing requests)
   */
  static async removeRelationship(playerId: number, data: RemoveSocialData) {
    const validatedData = RemoveSocialSchema.parse(data);

    try {
      const result = await prisma.social.deleteMany({
        where: {
          playerId,
          friendId: validatedData.friendId,
          relationshipType: validatedData.relationshipType,
          status: 'requested', // Only allow removing pending requests
        },
      });

      if (result.count === 0) {
        throw new Error(
          'No active relationship request found with the specified user',
        );
      }

      return {
        message: `${validatedData.relationshipType} relationship request removed successfully`,
        relationshipType: validatedData.relationshipType,
      };
    } catch (error: any) {
      logError('Error removing social relationship', {
        playerId,
        friendId: validatedData.friendId,
        error,
      });
      throw error;
    }
  }

  /**
   * Ends an existing friendship relationship (both accepted relationships)
   */
  static async endRelationship(playerId: number, data: EndRelationshipData) {
    const validatedData = EndRelationshipSchema.parse(data);

    try {
      await prisma.social.updateMany({
        where: {
          OR: [
            {
              playerId,
              friendId: validatedData.friendId,
              status: 'accepted',
            },
            {
              playerId: validatedData.friendId,
              friendId: playerId,
              status: 'accepted',
            },
          ],
        },
        data: {
          status: 'ended',
          endDate: new Date(),
        },
      });

      return { message: 'Friendship ended successfully' };
    } catch (error: any) {
      logError('Error ending social relationship', {
        playerId,
        friendId: validatedData.friendId,
        error,
      });
      throw error;
    }
  }

  /**
   * Responds to a social relationship request (accept/decline)
   */
  static async respondToRequest(userId: number, data: RespondToRequestData) {
    const validatedData = RespondToRequestSchema.parse(data);

    try {
      const newStatus =
        validatedData.action === 'accept' ? 'accepted' : 'declined';
      const acceptanceDate =
        validatedData.action === 'accept' ? new Date() : null;
      const endDate = validatedData.action === 'decline' ? new Date() : null;

      const updateResult = await prisma.social.updateMany({
        where: {
          id: validatedData.requestId,
          friendId: userId,
          status: 'requested',
        },
        data: {
          status: newStatus,
          acceptanceDate,
          endDate,
        },
      });

      if (updateResult.count === 0) {
        throw new Error('Relationship request not found or already processed');
      }

      const message =
        validatedData.action === 'accept'
          ? 'Relationship request accepted successfully'
          : 'Relationship request declined successfully';

      return {
        message,
        action: validatedData.action,
        requestId: validatedData.requestId,
      };
    } catch (error: any) {
      logError('Error responding to relationship request', {
        userId,
        requestId: validatedData.requestId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets relationship information between two users
   */
  static async getRelationship(userId: number, data: GetRelationshipData) {
    const validatedData = GetRelationshipSchema.parse(data);

    try {
      // Check if the requesting user is the same as the userId parameter
      if (userId !== validatedData.userId) {
        throw new Error(
          'Forbidden: Cannot check relationship for another user',
        );
      }

      // Find the relationship between the two users
      const relationship = await prisma.social.findFirst({
        where: {
          OR: [
            {
              playerId: validatedData.userId,
              friendId: validatedData.targetUserId,
            },
            {
              playerId: validatedData.targetUserId,
              friendId: validatedData.userId,
            },
          ],
        },
      });

      if (!relationship) {
        return {
          relationship: null,
          canInteract: true,
          availableActions: ['add'],
        } as RelationshipInfo;
      }

      // Determine available actions based on relationship status
      let availableActions: string[] = [];
      let canInteract = true;

      if (relationship.status === 'requested') {
        if (relationship.playerId === userId) {
          // Outgoing request
          availableActions = ['cancel'];
        } else {
          // Incoming request
          availableActions = ['accept', 'decline'];
        }
      } else if (relationship.status === 'accepted') {
        // Existing relationship
        availableActions = ['remove'];
      } else if (
        relationship.status === 'declined' ||
        relationship.status === 'ended'
      ) {
        // Ended relationship
        availableActions = ['add'];
        canInteract = true;
      }

      return {
        relationship,
        canInteract,
        availableActions,
      } as RelationshipInfo;
    } catch (error: any) {
      logError('Error getting relationship', {
        userId,
        targetUserId: validatedData.targetUserId,
        error,
      });
      throw error;
    }
  }

  /**
   * Lists social relationships with filtering and pagination
   */
  static async listRelationships(userId: number, data: ListSocialData) {
    const validatedData = ListSocialSchema.parse(data);

    try {
      const playerId = validatedData.playerId || userId;
      const whereCondition: any = {
        AND: [
          {
            OR: [{ playerId }, { friendId: playerId }],
          },
        ],
      };

      if (validatedData.type === 'REQUESTS') {
        whereCondition.AND.push({ status: 'requested' });
      } else {
        whereCondition.AND.push({
          relationshipType: validatedData.type,
          status: 'accepted',
        });
      }

      const relations = await prisma.social.findMany({
        where: whereCondition,
        include: {
          player: {
            select: {
              id: true,
              display_name: true,
              race: true,
              class: true,
              avatar: true,
              last_active: true,
            },
          },
          friend: {
            select: {
              id: true,
              display_name: true,
              race: true,
              class: true,
              avatar: true,
              last_active: true,
            },
          },
        },
        take: validatedData.limit || 50,
        orderBy: { requestDate: 'desc' },
      });

      // Filter out the current player details and keep only the friend's details
      const modifiedRelations = relations.map((relation) => {
        const { player, friend, ...restRelation } = relation;
        const contact = playerId === player.id ? friend : player;

        return {
          ...restRelation,
          friend: contact,
        };
      });

      return stringifyObj(modifiedRelations);
    } catch (error: any) {
      logError('Error listing social relationships', {
        userId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets top social relationships (limited to 5)
   */
  static async getTopRelationships(playerId: number, data: GetTopSocialData) {
    const validatedData = GetTopSocialSchema.parse(data);

    try {
      const relations = await prisma.social.findMany({
        where: {
          playerId,
          relationshipType: validatedData.type,
          status: 'accepted',
        },
        take: 5,
        include: {
          friend: {
            select: {
              id: true,
              display_name: true,
              race: true,
              class: true,
              avatar: true,
              last_active: true,
            },
          },
        },
        orderBy: { acceptanceDate: 'desc' },
      });

      return relations;
    } catch (error: any) {
      logError('Error getting top relationships', {
        playerId,
        type: validatedData.type,
        error,
      });
      throw error;
    }
  }

  /**
   * Counts pending social requests for a user
   */
  static async countPendingRequests(userId: number) {
    try {
      const count = await prisma.social.count({
        where: {
          friendId: userId,
          status: 'requested',
        },
      });

      return { count };
    } catch (error: any) {
      logError('Error counting pending requests', { userId, error });
      throw error;
    }
  }

  /**
   * Creates a gold transfer request between friends
   */
  static async createGoldRequest(userId: number, data: GoldRequestData) {
    const validatedData = GoldRequestSchema.parse(data);

    try {
      // Check if user is trying to request from themselves
      if (userId === validatedData.friendId) {
        throw new Error('Cannot create gold request for yourself');
      }

      const result = await createGoldRequest({
        fromUserId: userId,
        toUserId: validatedData.friendId,
        amount: validatedData.amount,
        notes: validatedData.notes,
      });

      return {
        message: 'Gold request created successfully',
        requestId: result.requestId,
        amount: validatedData.amount.toString(),
      };
    } catch (error: any) {
      logError('Error creating gold request', {
        userId,
        friendId: validatedData.friendId,
        error,
      });
      throw error;
    }
  }

  /**
   * Counts pending gold transfer requests for a user
   */
  static async countPendingGoldRequests(userId: number) {
    try {
      const count = await prisma.bank_history.count({
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
      });

      return { count };
    } catch (error: any) {
      logError('Error counting pending gold requests', { userId, error });
      throw error;
    }
  }

  /**
   * Gets pending gold transfer requests for a user
   */
  static async getPendingGoldRequests(userId: number) {
    try {
      return await getPendingFriendTransfers(userId);
    } catch (error: any) {
      logError('Error getting pending gold requests', { userId, error });
      throw error;
    }
  }

  /**
   * Responds to a gold transfer request (accept/decline)
   */
  static async respondToGoldRequest(
    userId: number,
    data: GoldRequestResponseData,
  ) {
    const validatedData = GoldRequestResponseSchema.parse(data);

    try {
      await respondToGoldRequest({
        requestId: validatedData.requestId,
        action: validatedData.action,
        message: validatedData.message,
      });

      return {
        message: `Gold request ${validatedData.action}ed successfully`,
        action: validatedData.action,
        requestId: validatedData.requestId,
      };
    } catch (error: any) {
      logError('Error responding to gold request', {
        userId,
        requestId: validatedData.requestId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets friend transfer history for a user
   */
  static async getFriendTransferHistory(
    userId: number,
    friendId?: number,
    page?: number,
    limit?: number,
  ) {
    try {
      return await getFriendTransferHistory({
        userId,
        friendId,
        page,
        limit,
      });
    } catch (error: any) {
      logError('Error getting friend transfer history', {
        userId,
        friendId,
        error,
      });
      throw error;
    }
  }

  /**
   * Cancels a pending friend transfer request
   */
  static async cancelGoldRequest(fromUserId: number, requestId: number) {
    try {
      return await cancelFriendTransfer(requestId, fromUserId);
    } catch (error: any) {
      logError('Error canceling gold request', {
        fromUserId,
        requestId,
        error,
      });
      throw error;
    }
  }

  /**
   * Transfers gold directly to a friend
   */
  static async transferGoldToFriend(
    fromUserId: number,
    toUserId: number,
    amount: bigint,
    notes?: string,
  ) {
    try {
      return await transferGoldToFriend({
        fromUserId,
        toUserId,
        amount,
        notes,
      });
    } catch (error: any) {
      logError('Error transferring gold to friend', {
        fromUserId,
        toUserId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets comprehensive social statistics for a user
   */
  static async getSocialStats(userId: number) {
    try {
      const [
        friendCount,
        enemyCount,
        pendingRequestCount,
        pendingGoldRequestCount,
      ] = await Promise.all([
        prisma.social.count({
          where: {
            OR: [{ playerId: userId }, { friendId: userId }],
            relationshipType: 'FRIEND',
            status: 'accepted',
          },
        }),
        prisma.social.count({
          where: {
            OR: [{ playerId: userId }, { friendId: userId }],
            relationshipType: 'ENEMY',
            status: 'accepted',
          },
        }),
        prisma.social.count({
          where: {
            friendId: userId,
            status: 'requested',
          },
        }),
        prisma.bank_history.count({
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
        }),
      ]);

      return {
        friends: friendCount,
        enemies: enemyCount,
        pendingRequests: pendingRequestCount,
        pendingGoldRequests: pendingGoldRequestCount,
      };
    } catch (error: any) {
      logError('Error getting social stats', { userId, error });
      throw error;
    }
  }

  /**
   * Gets a user's social network summary including recent activity
   */
  static async getSocialSummary(userId: number) {
    try {
      const [recentFriends, recentActivity, stats] = await Promise.all([
        // Get recent friendships (last 30 days)
        prisma.social.findMany({
          where: {
            OR: [{ playerId: userId }, { friendId: userId }],
            relationshipType: 'FRIEND',
            status: 'accepted',
            acceptanceDate: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
          include: {
            friend: {
              select: {
                id: true,
                display_name: true,
                race: true,
                class: true,
                avatar: true,
                last_active: true,
              },
            },
            player: {
              select: {
                id: true,
                display_name: true,
                race: true,
                class: true,
                avatar: true,
                last_active: true,
              },
            },
          },
          orderBy: { acceptanceDate: 'desc' },
          take: 10,
        }),
        // Get recent social activity (last 7 days)
        prisma.social.findMany({
          where: {
            OR: [{ playerId: userId }, { friendId: userId }],
            requestDate: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          include: {
            friend: {
              select: {
                id: true,
                display_name: true,
                race: true,
                class: true,
                avatar: true,
              },
            },
            player: {
              select: {
                id: true,
                display_name: true,
                race: true,
                class: true,
                avatar: true,
              },
            },
          },
          orderBy: { requestDate: 'desc' },
          take: 20,
        }),
        this.getSocialStats(userId),
      ]);

      // Format recent friends
      const formattedRecentFriends = recentFriends.map((relation) => {
        const contact =
          userId === relation.player.id ? relation.friend : relation.player;
        return {
          ...relation,
          friend: contact,
        };
      });

      // Format recent activity
      const formattedRecentActivity = recentActivity.map((relation) => {
        const contact =
          userId === relation.player.id ? relation.friend : relation.player;
        return {
          ...relation,
          friend: contact,
        };
      });

      return {
        stats,
        recentFriends: formattedRecentFriends,
        recentActivity: formattedRecentActivity,
      };
    } catch (error: any) {
      logError('Error getting social summary', { userId, error });
      throw error;
    }
  }
}
