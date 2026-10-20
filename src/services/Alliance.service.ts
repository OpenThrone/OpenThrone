import { z } from 'zod';

import type {
  AlliancePermissionKey,
  AlliancePermissions,
} from '@/constants/alliancePermissions';
import {
  ALLIANCE_PERMISSION_KEYS,
  DEFAULT_ALLIANCE_ROLE_NAME,
  emptyAlliancePermissions,
  hasAlliancePermission,
  outranksRole,
} from '@/constants/alliancePermissions';
import { MAX_ALLIANCE_MEMBERSHIPS } from '@/constants/alliances';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { WarStatus } from '@/lib/prisma-exports';
import {
  evictUserFromAllianceChatRooms,
  evictUserFromChatRoom,
} from '@/lib/socket';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  lockAllianceThenUsers,
} from '@/services/AllianceBank.service';
import { cancelPendingGoldRequests } from '@/services/AllianceGoldRequest.service';
import {
  distributeTreasuryOnDisband,
  settleLoanCreditsInTx,
  settleLoansOnExit,
  writeOffAllianceLoans,
} from '@/services/AllianceLoan.service';
import { lockAllianceChatRooms } from '@/services/chatRoomGuards';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';
import { getLevelFromXP } from '@/utils/utilities';

// Type definitions for alliance operations
/** Describes the create alliance data contract. */
export interface CreateAllianceData {
  name: string;
  avatar?: string;
  motto?: string;
  comments?: string;
  join_mode?: 'OPEN' | 'REQUEST_TO_JOIN' | 'INVITE_ONLY';
  roster_visibility?: 'PUBLIC' | 'MEMBERS_ONLY';
}

/** Describes the join alliance data contract. */
export interface JoinAllianceData {
  allianceId: number;
}

const AllianceJoinMode = {
  OPEN: 'OPEN',
  REQUEST_TO_JOIN: 'REQUEST_TO_JOIN',
  INVITE_ONLY: 'INVITE_ONLY',
} as const;

const AllianceRosterVisibility = {
  PUBLIC: 'PUBLIC',
  MEMBERS_ONLY: 'MEMBERS_ONLY',
} as const;

/** Describes the update alliance data contract. */
export interface UpdateAllianceData {
  name?: string;
  avatar?: string;
  motto?: string;
  comments?: string;
  join_mode?: 'OPEN' | 'REQUEST_TO_JOIN' | 'INVITE_ONLY';
  roster_visibility?: 'PUBLIC' | 'MEMBERS_ONLY';
  bannerimg?: string;
  slug?: string;
}

/** Describes the leave alliance data contract. */
export interface LeaveAllianceData {
  allianceId: number;
}

/** Describes the kick member data contract. */
export interface KickMemberData {
  allianceId: number;
  memberId: number;
}

/** Describes the transfer leadership data contract. */
export interface TransferLeadershipData {
  allianceId: number;
  newLeaderId: number;
}

/** Describes the create role data contract. */
export interface CreateRoleData {
  allianceId: number;
  name: string;
  permissions: AlliancePermissions;
}

/** Describes the update role data contract. */
export interface UpdateRoleData {
  name?: string;
  permissions?: AlliancePermissions;
}

/** Describes the change member role data contract. */
export interface ChangeMemberRoleData {
  allianceId: number;
  userId: number;
  roleId: number;
}

/** Describes the alliance info data contract. */
export interface AllianceInfo {
  id: number;
  name: string;
  leader_id: number;
  avatar?: string;
  motto?: string;
  comments?: string;
  is_public: boolean;
  require_auth: boolean;
  closed_enrollment: boolean;
  roster_visibility?: 'PUBLIC' | 'MEMBERS_ONLY';
  /** Treasury; only present for alliance members (ALL-08). */
  gold_in_bank?: bigint | string;
  created_at: Date;
  updated_at: Date;
  bannerimg?: string;
  slug?: string;
  leader: {
    display_name: string;
  };
  _count: {
    members: number;
  };
  members?: AllianceMember[];
  /** Rank definitions, highest first; only present for alliance members. */
  alliance_roles?: AllianceRole[];
}

export interface AllianceMember {
  id: number;
  alliance_id: number;
  user_id: number;
  role_id: number;
  created_at: Date;
  updated_at: Date;
  user: {
    id: number;
    display_name: string;
    race: string;
    class: string;
    avatar?: string;
    last_active: Date | null;
  };
  role: {
    id: number;
    name: string;
    permissions?: any;
    rank_order?: number;
  };
}

export interface AllianceRole {
  id: number;
  name: string;
  alliance_id: number;
  created_at: Date;
  updated_at: Date;
  permissions: any;
  rank_order: number;
}

/** Describes the alliance search filters data contract. */
export interface AllianceSearchFilters {
  search?: string;
  is_public?: boolean;
  closed_enrollment?: boolean;
  limit?: number;
  offset?: number;
}

// Zod schemas for validation
const CreateAllianceSchema = z.object({
  name: z.string().min(1, 'Alliance name is required').max(100),
  avatar: z.string().optional(),
  motto: z.string().max(255).optional(),
  comments: z.string().max(1000).optional(),
  join_mode: z.nativeEnum(AllianceJoinMode).optional(),
  roster_visibility: z.nativeEnum(AllianceRosterVisibility).optional(),
});

const UpdateAllianceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().optional(),
  motto: z.string().max(255).optional(),
  comments: z.string().max(1000).optional(),
  join_mode: z.nativeEnum(AllianceJoinMode).optional(),
  roster_visibility: z.nativeEnum(AllianceRosterVisibility).optional(),
  bannerimg: z.string().optional(),
  slug: z.string().optional(),
});

const JoinAllianceSchema = z.object({
  allianceId: z.number().int().positive(),
});

const LeaveAllianceSchema = z.object({
  allianceId: z.number().int().positive(),
});

const KickMemberSchema = z.object({
  allianceId: z.number().int().positive(),
  memberId: z.number().int().positive(),
});

const TransferLeadershipSchema = z.object({
  allianceId: z.number().int().positive(),
  newLeaderId: z.number().int().positive(),
});

const PermissionsSchema = z
  .object(
    Object.fromEntries(
      ALLIANCE_PERMISSION_KEYS.map((key) => [key, z.boolean().optional()]),
    ) as Record<AlliancePermissionKey, z.ZodOptional<z.ZodBoolean>>,
  )
  .strict();

const CreateRoleSchema = z.object({
  allianceId: z.number().int().positive(),
  name: z.string().trim().min(1).max(50),
  permissions: PermissionsSchema,
});

const UpdateRoleSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  permissions: PermissionsSchema.optional(),
});

const ChangeMemberRoleSchema = z.object({
  allianceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  roleId: z.number().int().positive(),
});

const ReorderRolesSchema = z.array(z.number().int().positive()).min(1).max(100);

const AllianceSearchSchema = z.object({
  search: z.string().optional(),
  is_public: z.boolean().optional(),
  closed_enrollment: z.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

/**
 * Whether the viewer belongs to the alliance. The leader always counts, and
 * a signed-out viewer (null) never does.
 */
export const isAllianceMember = (
  alliance: { leader_id?: number; members?: { user_id: number }[] },
  viewerId: number | null | undefined,
): boolean => {
  if (viewerId == null) return false;
  return (
    alliance.leader_id === viewerId ||
    (alliance.members?.some((m) => m.user_id === viewerId) ?? false)
  );
};

/**
 * Removes member-only data before an alliance is shown to someone outside it
 * (ALL-08). Non-members never see the treasury or the role definitions; they
 * see the roster (without role permissions) only when roster_visibility is
 * PUBLIC. Anything other than an explicit PUBLIC hides the roster.
 */
export const redactAllianceForViewer = <T extends Record<string, any>>(
  alliance: T,
  viewerIsMember: boolean,
): T => {
  if (viewerIsMember) return alliance;
  const {
    gold_in_bank: _treasury,
    alliance_roles: _roles,
    members,
    ...publicInfo
  } = alliance;
  if (
    alliance.roster_visibility !== AllianceRosterVisibility.PUBLIC ||
    !Array.isArray(members)
  ) {
    return publicInfo as unknown as T;
  }
  return {
    ...publicInfo,
    members: members.map((member: any) => {
      if (!member?.role) return member;
      const { permissions: _permissions, ...role } = member.role;
      return { ...member, role };
    }),
  } as unknown as T;
};

/** Encapsulates alliance data access and domain operations. */
export class AllianceService {
  /**
   * Validates that a user can create an alliance. Runs inside the creation
   * transaction after the user's row is locked, so concurrent creates and
   * joins by the same user see each other's writes.
   */
  private static async validateAllianceCreation(
    tx: Prisma.TransactionClient,
    userId: number,
    data: { name: string },
  ) {
    // Check if user already leads an alliance
    const existingAlliance = await tx.alliances.findFirst({
      where: { leader_id: userId },
    });

    if (existingAlliance) {
      throw new Error('You already lead an alliance');
    }

    // Check if user is already in 3 alliances
    const membershipCount = await tx.alliance_memberships.count({
      where: { user_id: userId },
    });

    if (membershipCount >= MAX_ALLIANCE_MEMBERSHIPS) {
      throw new Error(
        `You can only be a member of ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
      );
    }

    // Check if alliance name is already taken
    const existingAllianceWithName = await tx.alliances.findFirst({
      where: { name: data.name },
    });

    if (existingAllianceWithName) {
      throw new Error('An alliance with this name already exists');
    }
  }

  /**
   * Creates a new alliance. The creator's row is locked first, every
   * precondition is re-checked inside the transaction, and the fee is a
   * conditional decrement (gold >= cost), so parallel creates cannot overdraw
   * or leave one user leading two alliances (ALL-02).
   */
  static async createAlliance(userId: number, data: CreateAllianceData) {
    // Validate and ensure required fields
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Alliance name is required');
    }

    const validatedData = CreateAllianceSchema.parse(
      data,
    ) as CreateAllianceData;

    // After validation, ensure name is still present
    if (!validatedData.name) {
      throw new Error('Alliance name is required');
    }

    const allianceCreationCost = BigInt(100000000); // 100 million gold

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        await this.validateAllianceCreation(tx, userId, validatedData);

        // Get the user to check level and gold requirements
        const user = await tx.users.findUnique({
          where: { id: userId },
          select: { experience: true, gold: true, display_name: true },
        });

        if (!user) {
          throw new Error('User not found');
        }

        const userLevel = getLevelFromXP(user.experience);

        if (userLevel < 10) {
          throw new Error('User level must be at least 10');
        }

        if (user.gold < allianceCreationCost) {
          throw new Error('Insufficient gold to create alliance');
        }

        // Deduct gold from user, guarded by the balance check
        const debit = await tx.users.updateMany({
          where: { id: userId, gold: { gte: allianceCreationCost } },
          data: {
            gold: {
              decrement: allianceCreationCost,
            },
          },
        });
        if (debit.count !== 1) {
          throw new Error('Insufficient gold to create alliance');
        }

        // Create the alliance
        const alliance = await tx.alliances.create({
          data: {
            name: validatedData.name,
            leader_id: userId,
            avatar: validatedData.avatar,
            motto: validatedData.motto,
            comments: validatedData.comments,
            join_mode: validatedData.join_mode ?? AllianceJoinMode.OPEN,
            roster_visibility:
              validatedData.roster_visibility ??
              AllianceRosterVisibility.PUBLIC,
            // Map legacy fields if necessary or deprecate them.
            is_public: validatedData.join_mode !== AllianceJoinMode.INVITE_ONLY,
            closed_enrollment:
              validatedData.join_mode === AllianceJoinMode.INVITE_ONLY,
            require_auth:
              validatedData.join_mode === AllianceJoinMode.REQUEST_TO_JOIN,
          },
          include: {
            leader: {
              select: { display_name: true },
            },
            _count: {
              select: { members: true },
            },
          },
        });

        // Create default role
        const defaultRole = await tx.alliance_roles.create({
          data: {
            name: DEFAULT_ALLIANCE_ROLE_NAME,
            alliance_id: alliance.id,
            rank_order: 0,
            permissions: {
              ...emptyAlliancePermissions(),
              send_messages: true,
              view_list: true,
              request_gold: true,
              share_reports: true,
            },
          },
        });

        // Add leader as member with default role
        await tx.alliance_memberships.create({
          data: {
            alliance_id: alliance.id,
            user_id: userId,
            role_id: defaultRole.id,
          },
        });

        return alliance;
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error creating alliance', {
        userId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets all alliances with optional filtering and pagination. Member-only
   * fields are removed for every alliance the viewer does not belong to.
   */
  static async getAllAlliances(
    filters?: AllianceSearchFilters,
    viewerId: number | null = null,
  ) {
    const validatedFilters = filters ? AllianceSearchSchema.parse(filters) : {};

    try {
      const whereCondition: any = {};

      if (validatedFilters.search) {
        whereCondition.OR = [
          { name: { contains: validatedFilters.search, mode: 'insensitive' } },
          { motto: { contains: validatedFilters.search, mode: 'insensitive' } },
          {
            comments: {
              contains: validatedFilters.search,
              mode: 'insensitive',
            },
          },
        ];
      }

      if (validatedFilters.is_public !== undefined) {
        whereCondition.is_public = validatedFilters.is_public;
      }

      if (validatedFilters.closed_enrollment !== undefined) {
        whereCondition.closed_enrollment = validatedFilters.closed_enrollment;
      }

      const alliances = await prisma.alliances.findMany({
        where: whereCondition,
        include: {
          leader: {
            select: {
              display_name: true,
            },
          },
          _count: {
            select: {
              members: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  display_name: true,
                },
              },
              role: {
                select: {
                  name: true,
                },
              },
            },
            take: 10, // Limit members in response for performance
          },
        },
        take: validatedFilters.limit || 50,
        skip: validatedFilters.offset || 0,
        orderBy: { created_at: 'desc' },
      });

      const viewerAllianceIds = new Set<number>();
      if (viewerId != null) {
        const memberships = await prisma.alliance_memberships.findMany({
          where: { user_id: viewerId },
          select: { alliance_id: true },
        });
        memberships.forEach((m) => viewerAllianceIds.add(m.alliance_id));
      }

      return stringifyObj(alliances).map((alliance) =>
        redactAllianceForViewer(
          alliance,
          viewerAllianceIds.has(alliance.id) ||
            (viewerId != null && alliance.leader_id === viewerId),
        ),
      );
    } catch (error: any) {
      logError('Error getting all alliances', {
        filters: validatedFilters,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets alliance details by ID
   */
  static async getAllianceById(allianceId: number) {
    try {
      const alliance = await prisma.alliances.findUnique({
        where: { id: allianceId },
        include: {
          leader: {
            select: {
              display_name: true,
              race: true,
              class: true,
              avatar: true,
              last_active: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  display_name: true,
                  race: true,
                  class: true,
                  avatar: true,
                  last_active: true,
                },
              },
              role: {
                select: {
                  id: true,
                  name: true,
                  permissions: true,
                  rank_order: true,
                },
              },
            },
            orderBy: { created_at: 'asc' },
          },
          alliance_roles: {
            orderBy: [{ rank_order: 'asc' }, { id: 'asc' }],
          },
          _count: {
            select: {
              members: true,
            },
          },
        },
      });

      if (!alliance) {
        throw new Error('Alliance not found');
      }

      return stringifyObj(alliance);
    } catch (error: any) {
      logError('Error getting alliance by ID', { allianceId, error });
      throw error;
    }
  }

  /**
   * Gets an alliance as a given viewer may see it (ALL-08). Pass null for a
   * signed-out visitor. Members get everything; others get public info, and
   * the roster only when roster_visibility is PUBLIC.
   */
  static async getAllianceForViewer(
    allianceId: number,
    viewerId: number | null,
  ) {
    const alliance = await this.getAllianceById(allianceId);
    const isMember = isAllianceMember(alliance, viewerId);
    return {
      alliance: redactAllianceForViewer(alliance, isMember),
      isMember,
    };
  }

  /**
   * Updates alliance information
   */
  static async updateAlliance(
    allianceId: number,
    leaderId: number,
    data: UpdateAllianceData,
  ) {
    const validatedData = UpdateAllianceSchema.parse(data);

    try {
      const alliance = await prisma.alliances.findUnique({
        where: { id: allianceId },
        select: { id: true, leader_id: true },
      });
      if (!alliance) throw new Error('Alliance not found');

      // The leader edits everything; a rank with edit_profile may edit the
      // public profile (motto, description, avatar, banner) only.
      const isLeader = alliance.leader_id === leaderId;
      if (!isLeader) {
        const membership = await prisma.alliance_memberships.findFirst({
          where: { alliance_id: allianceId, user_id: leaderId },
          include: { role: true },
        });
        if (
          !membership ||
          !hasAlliancePermission(
            alliance.leader_id,
            leaderId,
            membership.role,
            'edit_profile',
          )
        ) {
          throw new Error('You do not have permission to edit this alliance');
        }
        const leaderOnly = (
          ['name', 'slug', 'join_mode', 'roster_visibility'] as const
        ).filter((key) => validatedData[key] !== undefined);
        if (leaderOnly.length) {
          throw new Error(
            'Only the leader can change the name, join mode or roster visibility',
          );
        }
      }

      const updatedAlliance = await prisma.alliances.update({
        where: { id: allianceId },
        data: {
          ...validatedData,
          // Keep the legacy flags in step with join_mode (they were only set
          // at creation, so a later switch to Open still refused joins).
          ...(validatedData.join_mode
            ? {
                is_public:
                  validatedData.join_mode !== AllianceJoinMode.INVITE_ONLY,
                closed_enrollment:
                  validatedData.join_mode === AllianceJoinMode.INVITE_ONLY,
                require_auth:
                  validatedData.join_mode === AllianceJoinMode.REQUEST_TO_JOIN,
              }
            : {}),
        },
        include: {
          leader: {
            select: { display_name: true },
          },
          _count: {
            select: { members: true },
          },
        },
      });

      return updatedAlliance;
    } catch (error: any) {
      logError('Error updating alliance', {
        allianceId,
        leaderId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Loads the acting user's standing in an alliance inside a transaction:
   * the alliance, whether they lead it, and their membership role.
   */
  private static async getActor(
    tx: Prisma.TransactionClient,
    allianceId: number,
    userId: number,
  ) {
    const alliance = await tx.alliances.findUnique({
      where: { id: allianceId },
    });
    if (!alliance) {
      throw new Error('Alliance not found');
    }
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { role: true },
    });
    const isLeader = alliance.leader_id === userId;
    if (!membership && !isLeader) {
      throw new Error('You are not a member of this alliance');
    }
    return { alliance, membership, isLeader, role: membership?.role ?? null };
  }

  /** Throws unless the actor holds the permission (the leader always does). */
  private static requirePermission(
    actor: Awaited<ReturnType<typeof AllianceService.getActor>>,
    userId: number,
    key: AlliancePermissionKey,
    message: string,
  ) {
    if (
      !hasAlliancePermission(actor.alliance.leader_id, userId, actor.role, key)
    ) {
      throw new Error(message);
    }
  }

  /**
   * Shared teardown for a disband (leader) or a dissolve (admin), inside the
   * caller's transaction with the alliance row locked: pays out the treasury
   * (remainder to `payoutLeaderId`), writes off loans and removes chat rooms,
   * war records, shared logs, memberships and roles before the alliance row.
   */
  private static async teardownAlliance(
    tx: Prisma.TransactionClient,
    allianceId: number,
    payoutLeaderId: number,
  ) {
    // Repayments still parked on loans belong in the treasury first; then
    // the treasury is split among the members and loans are written off.
    await settleLoanCreditsInTx(tx, allianceId);
    const settled = await tx.alliances.findUnique({
      where: { id: allianceId },
      select: { gold_in_bank: true },
    });
    await distributeTreasuryOnDisband(
      tx,
      allianceId,
      payoutLeaderId,
      BigInt(settled?.gold_in_bank ?? 0),
    );
    await writeOffAllianceLoans(tx, allianceId);

    const [members, rooms] = await Promise.all([
      tx.alliance_memberships.findMany({
        where: { alliance_id: allianceId },
        select: { user_id: true },
      }),
      tx.chatRoom.findMany({
        where: { allianceId },
        select: { id: true },
      }),
    ]);
    const chatRoomIds = rooms.map((room) => room.id);

    // Children without ON DELETE CASCADE go first.
    if (chatRoomIds.length > 0) {
      await tx.chatRoomParticipant.deleteMany({
        where: { roomId: { in: chatRoomIds } },
      });
      await tx.chatRoom.deleteMany({ where: { id: { in: chatRoomIds } } });
    }
    await tx.attack_log_acl.deleteMany({
      where: { shared_with_alliance_id: allianceId },
    });
    await tx.alliance_wars.deleteMany({
      where: {
        OR: [
          { attacker_alliance_id: allianceId },
          { defender_alliance_id: allianceId },
        ],
      },
    });
    await tx.alliance_memberships.deleteMany({
      where: { alliance_id: allianceId },
    });
    await tx.alliance_roles.deleteMany({
      where: { alliance_id: allianceId },
    });
    await tx.alliances.delete({ where: { id: allianceId } });

    return {
      memberIds: members.map((member) => member.user_id),
      roomIds: chatRoomIds,
    };
  }

  /**
   * Dissolves an alliance as an administrator: the same teardown as a
   * disband, without the leader, name and war checks. `audit` runs inside the
   * transaction so the deletion and its audit record commit together.
   */
  static async adminDissolveAlliance(
    allianceId: number,
    audit: (
      tx: Prisma.TransactionClient,
      alliance: { id: number; name: string; leader_id: number | null },
    ) => Promise<void>,
  ) {
    const { memberIds, roomIds } = await prisma.$transaction(async (tx) => {
      await lockAllianceChatRooms(tx, allianceId);
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
      const alliance = await tx.alliances.findUnique({
        where: { id: allianceId },
        select: { id: true, name: true, leader_id: true },
      });
      if (!alliance) throw new Error('Alliance not found');
      const result = await AllianceService.teardownAlliance(
        tx,
        allianceId,
        alliance.leader_id ?? 0,
      );
      await audit(tx, alliance);
      return result;
    }, ALLIANCE_BANK_TX_OPTIONS);
    memberIds.forEach((userId) =>
      roomIds.forEach((roomId) => evictUserFromChatRoom(userId, roomId)),
    );
    return { message: 'Alliance dissolved' };
  }

  /**
   * Disbands an alliance (leader only). The leader must type the alliance
   * name and no war may be in progress. Any treasury is split evenly among
   * the members (remainder to the leader) and open loans are written off. Chat
   * rooms, war records, shared logs, memberships and roles are removed in the
   * same transaction; remaining child rows cascade with the alliance.
   */
  static async deleteAlliance(
    allianceId: number,
    leaderId: number,
    confirmName: string,
  ) {
    try {
      const { memberIds, roomIds } = await prisma.$transaction(async (tx) => {
        await lockAllianceChatRooms(tx, allianceId);
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const alliance = await tx.alliances.findUnique({
          where: { id: allianceId },
        });
        if (!alliance || alliance.leader_id !== leaderId) {
          throw new Error('Alliance not found or you are not the leader');
        }
        if (confirmName !== alliance.name) {
          throw new Error('Type the alliance name exactly to disband it');
        }
        const activeWar = await tx.alliance_wars.findFirst({
          where: {
            OR: [
              { attacker_alliance_id: allianceId },
              { defender_alliance_id: allianceId },
            ],
            status: { not: WarStatus.ENDED },
          },
          select: { id: true },
        });
        if (activeWar) {
          throw new Error('Wars must end before the alliance can disband');
        }

        return AllianceService.teardownAlliance(tx, allianceId, leaderId);
      }, ALLIANCE_BANK_TX_OPTIONS);

      memberIds.forEach((userId) =>
        roomIds.forEach((roomId) => evictUserFromChatRoom(userId, roomId)),
      );

      return { message: 'Alliance disbanded' };
    } catch (error: any) {
      logError('Error deleting alliance', { allianceId, leaderId, error });
      throw error;
    }
  }

  /**
   * Allows a user to join an alliance. Locks the alliance row, then the
   * user's row (lockAllianceThenUsers order) and re-checks every precondition
   * inside the transaction, so parallel joins cannot add the user twice or
   * past the membership limit (ALL-04).
   */
  static async joinAlliance(userId: number, data: JoinAllianceData) {
    const validatedData = JoinAllianceSchema.parse(data);

    try {
      const membership = await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, validatedData.allianceId, [userId]);

        // Check if user is already in THIS alliance
        const existingMembership = await tx.alliance_memberships.findUnique({
          where: {
            unique_alliance_user: {
              alliance_id: validatedData.allianceId,
              user_id: userId,
            },
          },
          select: { id: true },
        });

        if (existingMembership) {
          throw new Error('You are already a member of this alliance');
        }

        // Check membership limit
        const membershipCount = await tx.alliance_memberships.count({
          where: { user_id: userId },
        });

        if (membershipCount >= MAX_ALLIANCE_MEMBERSHIPS) {
          throw new Error('You can only be a member of 3 alliances');
        }

        // Get the alliance
        const alliance = await tx.alliances.findUnique({
          where: { id: validatedData.allianceId },
          include: {
            alliance_roles: {
              where: { name: 'Member' },
              take: 1,
            },
            _count: {
              select: { members: true },
            },
          },
        });

        if (!alliance) {
          throw new Error('Alliance not found');
        }

        if (alliance.join_mode === AllianceJoinMode.INVITE_ONLY) {
          throw new Error('This alliance is invite-only');
        }

        if (alliance.join_mode === AllianceJoinMode.REQUEST_TO_JOIN) {
          throw new Error('You must request to join this alliance');
        }

        if (!alliance.is_public) {
          throw new Error('This alliance is private');
        }

        const defaultRole = alliance.alliance_roles[0];
        if (!defaultRole) {
          throw new Error('No default member role found');
        }

        // Add user to alliance
        return tx.alliance_memberships.create({
          data: {
            alliance_id: validatedData.allianceId,
            user_id: userId,
            role_id: defaultRole.id,
          },
          include: {
            user: {
              select: {
                display_name: true,
              },
            },
            role: {
              select: {
                name: true,
              },
            },
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);

      return {
        message: 'Successfully joined alliance',
        membership,
      };
    } catch (error: any) {
      logError('Error joining alliance', {
        userId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Allows a user to leave an alliance
   */
  static async leaveAlliance(userId: number, data: LeaveAllianceData) {
    const validatedData = LeaveAllianceSchema.parse(data);

    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockAllianceChatRooms(tx, validatedData.allianceId);
        // Serialize with transferLeadership so the new leader cannot leave
        // between its membership check and the leader change.
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${validatedData.allianceId} FOR UPDATE`;
        // Get the membership
        const membership = await tx.alliance_memberships.findFirst({
          where: {
            alliance_id: validatedData.allianceId,
            user_id: userId,
          },
          include: {
            alliance: true,
          },
        });

        if (!membership) {
          throw new Error('You are not a member of this alliance');
        }

        // Check if user is the leader
        if (membership.alliance.leader_id === userId) {
          throw new Error(
            'Alliance leaders cannot leave. Transfer leadership or disband the alliance first.',
          );
        }

        // Remove membership
        await tx.alliance_memberships.delete({
          where: {
            id: membership.id,
          },
        });
        await cancelPendingGoldRequests(tx, validatedData.allianceId, userId);
        // Collects an unpaid loan from gold/bank, or throws to refuse the leave.
        await settleLoansOnExit(tx, validatedData.allianceId, userId, 'leave');

        return { message: 'Successfully left alliance' };
      });
      await evictUserFromAllianceChatRooms(userId, validatedData.allianceId);
      return result;
    } catch (error: any) {
      logError('Error leaving alliance', {
        userId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Kicks a member. Needs kick_member (the leader always has it) and the
   * target's rank must be strictly below the kicker's. Nobody can kick the
   * leader or themselves.
   */
  static async kickMember(
    allianceId: number,
    kickerId: number,
    data: KickMemberData,
  ) {
    const validatedData = KickMemberSchema.parse(data);

    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockAllianceChatRooms(tx, allianceId);
        // Same alliance-row lock as transferLeadership (see leaveAlliance).
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const actor = await this.getActor(tx, allianceId, kickerId);
        this.requirePermission(
          actor,
          kickerId,
          'kick_member',
          'You do not have permission to kick members',
        );

        if (validatedData.memberId === kickerId) {
          throw new Error(
            'You cannot kick yourself. Leave the alliance instead.',
          );
        }
        if (validatedData.memberId === actor.alliance.leader_id) {
          throw new Error('Cannot kick the alliance leader');
        }

        const memberToKick = await tx.alliance_memberships.findUnique({
          where: {
            unique_alliance_user: {
              alliance_id: allianceId,
              user_id: validatedData.memberId,
            },
          },
          include: { role: true },
        });

        if (!memberToKick) {
          throw new Error('Member not found in alliance');
        }

        if (
          !outranksRole(
            actor.isLeader,
            actor.role?.rank_order,
            memberToKick.role.rank_order,
          )
        ) {
          throw new Error('You can only kick members ranked below you');
        }

        await tx.alliance_memberships.delete({
          where: { id: memberToKick.id },
        });
        await cancelPendingGoldRequests(tx, allianceId, validatedData.memberId);
        // Collects what it can; any remainder is written off.
        await settleLoansOnExit(tx, allianceId, validatedData.memberId, 'kick');

        return { message: 'Member kicked successfully' };
      });
      await evictUserFromAllianceChatRooms(validatedData.memberId, allianceId);
      return result;
    } catch (error: any) {
      logError('Error kicking member', {
        allianceId,
        kickerId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Changes a member's rank. Needs grant_access; the member and the new rank
   * must both rank strictly below the actor (the leader is exempt). The
   * leader's own rank cannot be changed by anyone else.
   */
  static async changeMemberRole(actorId: number, data: ChangeMemberRoleData) {
    const validatedData = ChangeMemberRoleSchema.parse(data);
    const { allianceId, userId, roleId } = validatedData;

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const actor = await this.getActor(tx, allianceId, actorId);
        this.requirePermission(
          actor,
          actorId,
          'grant_access',
          'You do not have permission to change ranks',
        );

        if (userId === actorId && !actor.isLeader) {
          throw new Error('You cannot change your own rank');
        }
        if (userId === actor.alliance.leader_id && !actor.isLeader) {
          throw new Error("Cannot change the alliance leader's rank");
        }

        const target = await tx.alliance_memberships.findUnique({
          where: {
            unique_alliance_user: { alliance_id: allianceId, user_id: userId },
          },
          include: { role: true },
        });
        if (!target) {
          throw new Error('Member not found in alliance');
        }

        const role = await tx.alliance_roles.findFirst({
          where: { id: roleId, alliance_id: allianceId },
        });
        if (!role) {
          throw new Error('Rank not found');
        }

        const actorRank = actor.role?.rank_order;
        if (
          userId !== actorId &&
          !outranksRole(actor.isLeader, actorRank, target.role.rank_order)
        ) {
          throw new Error('You can only change the rank of members below you');
        }
        if (!outranksRole(actor.isLeader, actorRank, role.rank_order)) {
          throw new Error('You can only assign ranks below your own');
        }

        return tx.alliance_memberships.update({
          where: { id: target.id },
          data: { role_id: role.id },
          select: { id: true, user_id: true, role_id: true },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error changing member role', { actorId, data, error });
      throw error;
    }
  }

  /**
   * Transfers alliance leadership to another member. The alliance row and
   * both users are locked (lockAllianceThenUsers order); the current leader,
   * the new leader's membership and the one-led-alliance rule are re-checked
   * inside the transaction, and the update is guarded by the current
   * leader_id, so two concurrent transfers cannot both succeed (ALL-04).
   */
  static async transferLeadership(
    allianceId: number,
    currentLeaderId: number,
    data: TransferLeadershipData,
  ) {
    const validatedData = TransferLeadershipSchema.parse(data);

    try {
      const updatedAlliance = await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, allianceId, [
          currentLeaderId,
          validatedData.newLeaderId,
        ]);

        // Verify current user is the leader
        const alliance = await tx.alliances.findFirst({
          where: {
            id: allianceId,
            leader_id: currentLeaderId,
          },
        });

        if (!alliance) {
          throw new Error('Alliance not found or you are not the leader');
        }

        if (validatedData.newLeaderId === currentLeaderId) {
          throw new Error('You already lead this alliance');
        }

        // Verify the new leader is a member of the alliance
        const newLeaderMembership = await tx.alliance_memberships.findFirst({
          where: {
            alliance_id: allianceId,
            user_id: validatedData.newLeaderId,
          },
        });

        if (!newLeaderMembership) {
          throw new Error('New leader must be a member of the alliance');
        }

        // A user may lead only one alliance (same rule as createAlliance)
        const otherLedAlliance = await tx.alliances.findFirst({
          where: {
            leader_id: validatedData.newLeaderId,
            id: { not: allianceId },
          },
          select: { id: true },
        });

        if (otherLedAlliance) {
          throw new Error('New leader already leads another alliance');
        }

        // Update alliance leadership, guarded by the current leader
        const changed = await tx.alliances.updateMany({
          where: { id: allianceId, leader_id: currentLeaderId },
          data: { leader_id: validatedData.newLeaderId },
        });

        if (changed.count !== 1) {
          throw new Error('Alliance not found or you are not the leader');
        }

        return tx.alliances.findUnique({
          where: { id: allianceId },
          include: {
            leader: {
              select: { display_name: true },
            },
            _count: {
              select: { members: true },
            },
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);

      return {
        message: 'Leadership transferred successfully',
        alliance: updatedAlliance,
      };
    } catch (error: any) {
      logError('Error transferring leadership', {
        allianceId,
        currentLeaderId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Lists every alliance a user belongs to (up to MAX_ALLIANCE_MEMBERSHIPS),
   * oldest membership first, with role, leader and member count.
   */
  static async getUserAlliances(userId: number) {
    try {
      return await prisma.alliance_memberships.findMany({
        where: { user_id: userId },
        orderBy: { id: 'asc' },
        include: {
          alliance: {
            include: {
              leader: {
                select: { display_name: true },
              },
              _count: {
                select: { members: true },
              },
            },
          },
          role: {
            select: {
              name: true,
              permissions: true,
            },
          },
        },
      });
    } catch (error: any) {
      logError('Error getting user alliances', { userId, error });
      throw error;
    }
  }

  /**
   * Lists the alliances of a target player that a viewer may see: those whose
   * roster is PUBLIC, plus any alliance the viewer also belongs to.
   */
  static async getVisibleAlliancesForPlayer(
    targetUserId: number,
    viewerId: number | null,
  ) {
    try {
      const memberships = await prisma.alliance_memberships.findMany({
        where: { user_id: targetUserId },
        orderBy: { id: 'asc' },
        select: {
          alliance: {
            select: {
              id: true,
              name: true,
              leader_id: true,
              roster_visibility: true,
            },
          },
        },
      });
      const viewerAllianceIds = new Set<number>();
      if (viewerId != null) {
        const mine = await prisma.alliance_memberships.findMany({
          where: { user_id: viewerId },
          select: { alliance_id: true },
        });
        mine.forEach((m) => viewerAllianceIds.add(m.alliance_id));
      }
      return memberships
        .map((m) => m.alliance)
        .filter(
          (a) =>
            a.roster_visibility === AllianceRosterVisibility.PUBLIC ||
            viewerAllianceIds.has(a.id),
        )
        .map((a) => ({
          id: a.id,
          name: a.name,
          isLeader: a.leader_id === targetUserId,
        }));
    } catch (error: any) {
      logError('Error getting visible alliances for player', {
        targetUserId,
        error,
      });
      throw error;
    }
  }

  /**
   * Throws if a non-leader tries to switch on a permission they lack. Keys
   * already true on the role (or being switched off) are allowed.
   */
  private static assertCanGrant(
    actor: Awaited<ReturnType<typeof AllianceService.getActor>>,
    actorId: number,
    previous: unknown,
    next: AlliancePermissions,
  ) {
    if (actor.isLeader) return;
    const before = (previous ?? {}) as Record<string, unknown>;
    for (const key of ALLIANCE_PERMISSION_KEYS) {
      if (
        next[key] === true &&
        before[key] !== true &&
        !hasAlliancePermission(
          actor.alliance.leader_id,
          actorId,
          actor.role,
          key,
        )
      ) {
        throw new Error('You cannot grant a permission you do not have');
      }
    }
  }

  /** Roles of an alliance, highest rank first. */
  private static async getOrderedRoles(
    tx: Prisma.TransactionClient,
    allianceId: number,
  ) {
    return tx.alliance_roles.findMany({
      where: { alliance_id: allianceId },
      orderBy: [{ rank_order: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Creates a rank just above the default Member rank. Needs edit_ranks; a
   * non-leader may only grant permissions they hold and the new rank must
   * land below their own.
   */
  static async createRole(
    allianceId: number,
    creatorId: number,
    data: CreateRoleData,
  ) {
    const validatedData = CreateRoleSchema.parse({ ...data, allianceId });

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const actor = await this.getActor(tx, allianceId, creatorId);
        this.requirePermission(
          actor,
          creatorId,
          'edit_ranks',
          'You do not have permission to manage roles',
        );
        this.assertCanGrant(actor, creatorId, {}, validatedData.permissions);

        const roles = await this.getOrderedRoles(tx, allianceId);
        if (roles.length >= 50) {
          throw new Error('An alliance can have at most 50 ranks');
        }
        if (roles.some((role) => role.name === validatedData.name)) {
          throw new Error('A rank with this name already exists');
        }

        const defaultRole = roles.find(
          (role) => role.name === DEFAULT_ALLIANCE_ROLE_NAME,
        );
        const rankOrder = defaultRole
          ? defaultRole.rank_order
          : (roles.at(-1)?.rank_order ?? -1) + 1;

        if (!outranksRole(actor.isLeader, actor.role?.rank_order, rankOrder)) {
          throw new Error('You can only create ranks below your own');
        }

        if (defaultRole) {
          // Keep the default rank last.
          await tx.alliance_roles.updateMany({
            where: {
              alliance_id: allianceId,
              rank_order: { gte: rankOrder },
            },
            data: { rank_order: { increment: 1 } },
          });
        }

        return tx.alliance_roles.create({
          data: {
            name: validatedData.name,
            alliance_id: allianceId,
            rank_order: rankOrder,
            permissions: {
              ...emptyAlliancePermissions(),
              ...validatedData.permissions,
            },
          },
        });
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error creating alliance role', {
        allianceId,
        creatorId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Renames a rank or changes its permissions. Needs edit_ranks; a non-leader
   * may only edit ranks below their own and only grant permissions they hold.
   * The default Member rank keeps its name.
   */
  static async updateRole(
    allianceId: number,
    roleId: number,
    updaterId: number,
    data: UpdateRoleData,
  ) {
    const validatedData = UpdateRoleSchema.parse(data);

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const actor = await this.getActor(tx, allianceId, updaterId);
        this.requirePermission(
          actor,
          updaterId,
          'edit_ranks',
          'You do not have permission to manage roles',
        );

        const role = await tx.alliance_roles.findFirst({
          where: { id: roleId, alliance_id: allianceId },
        });
        if (!role) {
          throw new Error('Rank not found');
        }
        if (
          !outranksRole(actor.isLeader, actor.role?.rank_order, role.rank_order)
        ) {
          throw new Error('You can only edit ranks below your own');
        }

        const updates: Prisma.alliance_rolesUpdateInput = {};
        if (validatedData.name && validatedData.name !== role.name) {
          if (role.name === DEFAULT_ALLIANCE_ROLE_NAME) {
            throw new Error('The default Member rank cannot be renamed');
          }
          if (validatedData.name === DEFAULT_ALLIANCE_ROLE_NAME) {
            throw new Error('That rank name is reserved');
          }
          const clash = await tx.alliance_roles.findFirst({
            where: {
              alliance_id: allianceId,
              name: validatedData.name,
              id: { not: roleId },
            },
            select: { id: true },
          });
          if (clash) {
            throw new Error('A rank with this name already exists');
          }
          updates.name = validatedData.name;
        }
        if (validatedData.permissions) {
          this.assertCanGrant(
            actor,
            updaterId,
            role.permissions,
            validatedData.permissions,
          );
          updates.permissions = {
            ...emptyAlliancePermissions(),
            ...((role.permissions ?? {}) as AlliancePermissions),
            ...validatedData.permissions,
          };
        }

        return tx.alliance_roles.update({
          where: { id: roleId },
          data: updates,
        });
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error updating alliance role', {
        allianceId,
        roleId,
        updaterId,
        data: validatedData,
        error,
      });
      throw error;
    }
  }

  /**
   * Reorders ranks. `roleIds` lists every rank of the alliance, highest
   * first; the default Member rank must stay last. A non-leader with
   * edit_ranks may only move ranks below their own.
   */
  static async reorderRoles(
    allianceId: number,
    actorId: number,
    roleIds: number[],
  ) {
    const orderedIds = ReorderRolesSchema.parse(roleIds);

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const actor = await this.getActor(tx, allianceId, actorId);
        this.requirePermission(
          actor,
          actorId,
          'edit_ranks',
          'You do not have permission to manage roles',
        );

        const roles = await this.getOrderedRoles(tx, allianceId);
        const known = new Set(roles.map((role) => role.id));
        if (
          orderedIds.length !== roles.length ||
          new Set(orderedIds).size !== orderedIds.length ||
          orderedIds.some((id) => !known.has(id))
        ) {
          throw new Error(
            'The rank list is out of date. Reload and try again.',
          );
        }

        const defaultRole = roles.find(
          (role) => role.name === DEFAULT_ALLIANCE_ROLE_NAME,
        );
        if (defaultRole && orderedIds.at(-1) !== defaultRole.id) {
          throw new Error('The default Member rank must stay last');
        }

        if (!actor.isLeader) {
          const actorRank = actor.role?.rank_order;
          roles.forEach((role, index) => {
            if (
              !outranksRole(false, actorRank, role.rank_order) &&
              orderedIds[index] !== role.id
            ) {
              throw new Error('You can only reorder ranks below your own');
            }
          });
        }

        for (const [index, id] of orderedIds.entries()) {
          await tx.alliance_roles.update({
            where: { id },
            data: { rank_order: index },
          });
        }

        return this.getOrderedRoles(tx, allianceId);
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error reordering alliance roles', {
        allianceId,
        actorId,
        error,
      });
      throw error;
    }
  }

  /**
   * Deletes a rank nobody holds. Needs edit_ranks and the rank must be below
   * the actor's (leader exempt). The default Member rank cannot be deleted.
   */
  static async deleteRole(
    allianceId: number,
    roleId: number,
    deleterId: number,
  ) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;

        const actor = await this.getActor(tx, allianceId, deleterId);
        this.requirePermission(
          actor,
          deleterId,
          'edit_ranks',
          'You do not have permission to manage roles',
        );

        const role = await tx.alliance_roles.findFirst({
          where: { id: roleId, alliance_id: allianceId },
        });
        if (!role) {
          throw new Error('Rank not found');
        }
        if (role.name === DEFAULT_ALLIANCE_ROLE_NAME) {
          throw new Error('The default Member rank cannot be deleted');
        }
        if (
          !outranksRole(actor.isLeader, actor.role?.rank_order, role.rank_order)
        ) {
          throw new Error('You can only delete ranks below your own');
        }

        const roleUsage = await tx.alliance_memberships.count({
          where: { role_id: roleId },
        });
        if (roleUsage > 0) {
          throw new Error('Cannot delete role that is assigned to members');
        }

        await tx.alliance_roles.delete({ where: { id: roleId } });

        return { message: 'Role deleted successfully' };
      }, ALLIANCE_BANK_TX_OPTIONS);
    } catch (error: any) {
      logError('Error deleting alliance role', {
        allianceId,
        roleId,
        deleterId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets alliance statistics
   */
  static async getAllianceStats(allianceId: number) {
    try {
      const [totalMembers, totalRoles, recentJoins] = await Promise.all([
        prisma.alliance_memberships.count({
          where: { alliance_id: allianceId },
        }),
        prisma.alliance_roles.count({
          where: { alliance_id: allianceId },
        }),
        prisma.alliance_memberships.count({
          where: {
            alliance_id: allianceId,
            created_at: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
      ]);

      return {
        totalMembers,
        totalRoles,
        recentJoins,
      };
    } catch (error: any) {
      logError('Error getting alliance stats', { allianceId, error });
      throw error;
    }
  }

  /**
   * Creates a request to join an alliance
   */
  static async createJoinRequest(userId: number, allianceId: number) {
    try {
      // Check if user is already in this alliance
      const isMember = await prisma.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: allianceId,
            user_id: userId,
          },
        },
      });

      if (isMember) {
        throw new Error('You are already a member of this alliance');
      }

      // Check the membership limit
      const membershipCount = await prisma.alliance_memberships.count({
        where: { user_id: userId },
      });

      if (membershipCount >= MAX_ALLIANCE_MEMBERSHIPS) {
        throw new Error(
          `You can only be a member of ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
        );
      }

      // Check for existing pending request
      const existingRequest = await prisma.alliance_join_requests.findFirst({
        where: {
          user_id: userId,
          alliance_id: allianceId,
          status: 'PENDING',
        },
      });

      if (existingRequest) {
        throw new Error(
          existingRequest.kind === 'INVITE'
            ? 'This alliance has already invited you. Accept the invitation on My Alliances.'
            : 'You already have a pending request for this alliance',
        );
      }

      // Create request
      await prisma.alliance_join_requests.create({
        data: {
          user_id: userId,
          alliance_id: allianceId,
          status: 'PENDING',
        },
      });

      return { message: 'Join request sent successfully' };
    } catch (error: any) {
      logError('Error creating join request', { userId, allianceId, error });
      throw error;
    }
  }

  /**
   * Accepts a join request. Locks the alliance row, the applicant's row and
   * the request row, then re-checks that the request is still pending, the
   * acceptor's permission and the applicant's membership limit inside one
   * transaction; the status change is conditional on PENDING (ALL-04).
   */
  static async acceptJoinRequest(requestId: number, acceptorId: number) {
    try {
      // Unlocked read only to learn which rows to lock
      const target = await prisma.alliance_join_requests.findUnique({
        where: { id: requestId },
        select: { alliance_id: true, user_id: true },
      });

      if (!target) {
        throw new Error('Request not found or already processed');
      }

      await prisma.$transaction(async (tx) => {
        await lockAllianceThenUsers(tx, target.alliance_id, [target.user_id]);
        await tx.$queryRaw`SELECT id FROM alliance_join_requests WHERE id = ${requestId} FOR UPDATE`;

        const request = await tx.alliance_join_requests.findUnique({
          where: { id: requestId },
        });

        if (
          !request ||
          request.status !== 'PENDING' ||
          request.kind !== 'REQUEST' ||
          request.alliance_id !== target.alliance_id ||
          request.user_id !== target.user_id
        ) {
          throw new Error('Request not found or already processed');
        }

        // Check permissions
        const acceptorMembership = await tx.alliance_memberships.findFirst({
          where: {
            alliance_id: request.alliance_id,
            user_id: acceptorId,
          },
          include: { role: true, alliance: true },
        });

        if (!acceptorMembership) {
          throw new Error('You are not a member of this alliance');
        }

        const canAccept = hasAlliancePermission(
          acceptorMembership.alliance.leader_id,
          acceptorId,
          acceptorMembership.role,
          'invite_member',
        );

        if (!canAccept) {
          throw new Error('You do not have permission to accept requests');
        }

        const alreadyMember = await tx.alliance_memberships.findUnique({
          where: {
            unique_alliance_user: {
              alliance_id: request.alliance_id,
              user_id: request.user_id,
            },
          },
          select: { id: true },
        });

        if (alreadyMember) {
          throw new Error('User is already a member of this alliance');
        }

        // Check limits again
        const membershipCount = await tx.alliance_memberships.count({
          where: { user_id: request.user_id },
        });

        if (membershipCount >= MAX_ALLIANCE_MEMBERSHIPS) {
          throw new Error(
            `User is already in ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
          );
        }

        // Create membership
        // Use default role "Member"
        const defaultRole = await tx.alliance_roles.findFirst({
          where: { alliance_id: request.alliance_id, name: 'Member' },
        });

        if (!defaultRole) throw new Error('Default role not found');

        await tx.alliance_memberships.create({
          data: {
            alliance_id: request.alliance_id,
            user_id: request.user_id,
            role_id: defaultRole.id,
          },
        });

        // Update request, only if it is still pending
        const updated = await tx.alliance_join_requests.updateMany({
          where: { id: requestId, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            moderated_by: acceptorId,
          },
        });

        if (updated.count !== 1) {
          throw new Error('Request not found or already processed');
        }
      }, ALLIANCE_BANK_TX_OPTIONS);

      return { message: 'Request accepted' };
    } catch (error: any) {
      logError('Error accepting join request', {
        requestId,
        acceptorId,
        error,
      });
      throw error;
    }
  }

  /**
   * Rejects a join request
   */
  static async rejectJoinRequest(requestId: number, acceptorId: number) {
    try {
      const request = await prisma.alliance_join_requests.findUnique({
        where: { id: requestId },
      });

      if (
        !request ||
        request.status !== 'PENDING' ||
        request.kind !== 'REQUEST'
      ) {
        throw new Error('Request not found or already processed');
      }

      // Check permissions (same as accept)
      const acceptorMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: request.alliance_id,
          user_id: acceptorId,
        },
        include: { role: true, alliance: true },
      });

      if (!acceptorMembership) {
        throw new Error('You are not a member of this alliance');
      }

      const canReject = hasAlliancePermission(
        acceptorMembership.alliance.leader_id,
        acceptorId,
        acceptorMembership.role,
        'invite_member',
      );

      if (!canReject) {
        throw new Error('You do not have permission to reject requests');
      }

      // Only a still-pending request can be rejected (an accept may have won)
      const rejected = await prisma.alliance_join_requests.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          moderated_by: acceptorId,
        },
      });

      if (rejected.count !== 1) {
        throw new Error('Request not found or already processed');
      }

      return { message: 'Request rejected' };
    } catch (error: any) {
      logError('Error rejecting join request', {
        requestId,
        acceptorId,
        error,
      });
      throw error;
    }
  }

  /** Whether `userId` holds invite_member in the alliance (the leader always does). */
  private static async canInvite(
    db: Prisma.TransactionClient | typeof prisma,
    allianceId: number,
    userId: number,
  ) {
    const membership = await db.alliance_memberships.findFirst({
      where: { alliance_id: allianceId, user_id: userId },
      include: { role: true, alliance: { select: { leader_id: true } } },
    });
    return (
      !!membership &&
      hasAlliancePermission(
        membership.alliance.leader_id,
        userId,
        membership.role,
        'invite_member',
      )
    );
  }

  /**
   * Invites a player by display name. Needs invite_member. The player must
   * not already be a member, must have room for another membership, and
   * must not have a pending request or invitation for this alliance.
   */
  static async invitePlayer(
    inviterId: number,
    allianceId: number,
    displayName: string,
  ) {
    if (!(await this.canInvite(prisma, allianceId, inviterId))) {
      throw new Error('You do not have permission to invite players');
    }
    const target = await prisma.users.findFirst({
      where: {
        display_name: { equals: displayName.trim(), mode: 'insensitive' },
        id: { gt: 0 },
      },
      select: { id: true, display_name: true },
    });
    if (!target) throw new Error('No player with that name');
    const [isMember, membershipCount, pending] = await Promise.all([
      prisma.alliance_memberships.findFirst({
        where: { alliance_id: allianceId, user_id: target.id },
        select: { id: true },
      }),
      prisma.alliance_memberships.count({ where: { user_id: target.id } }),
      prisma.alliance_join_requests.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: target.id,
          status: 'PENDING',
        },
        select: { kind: true },
      }),
    ]);
    if (isMember) throw new Error(`${target.display_name} is already a member`);
    if (membershipCount >= MAX_ALLIANCE_MEMBERSHIPS) {
      throw new Error(
        `${target.display_name} is already in ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
      );
    }
    if (pending) {
      throw new Error(
        pending.kind === 'INVITE'
          ? `${target.display_name} has already been invited`
          : `${target.display_name} has already asked to join; accept their request instead`,
      );
    }
    await prisma.alliance_join_requests.create({
      data: {
        alliance_id: allianceId,
        user_id: target.id,
        status: 'PENDING',
        kind: 'INVITE',
        invited_by: inviterId,
      },
    });
    return { message: `Invitation sent to ${target.display_name}` };
  }

  /** The alliance's pending invitations (invite_member holders only). */
  static async getAllianceInvites(allianceId: number, userId: number) {
    if (!(await this.canInvite(prisma, allianceId, userId))) {
      throw new Error('No permission');
    }
    const invites = await prisma.alliance_join_requests.findMany({
      where: { alliance_id: allianceId, status: 'PENDING', kind: 'INVITE' },
      include: { user: { select: { id: true, display_name: true } } },
      orderBy: { created_at: 'desc' },
    });
    return invites.map((invite) => ({
      id: invite.id,
      created_at: invite.created_at,
      user: invite.user,
    }));
  }

  /** Withdraws a pending invitation (invite_member holders only). */
  static async cancelInvite(inviteId: number, userId: number) {
    const invite = await prisma.alliance_join_requests.findUnique({
      where: { id: inviteId },
      select: { alliance_id: true, kind: true, status: true },
    });
    if (!invite || invite.kind !== 'INVITE' || invite.status !== 'PENDING') {
      throw new Error('Invitation not found or already answered');
    }
    if (!(await this.canInvite(prisma, invite.alliance_id, userId))) {
      throw new Error('You do not have permission to cancel invitations');
    }
    await prisma.alliance_join_requests.updateMany({
      where: { id: inviteId, status: 'PENDING' },
      data: { status: 'CANCELLED', moderated_by: userId },
    });
    return { message: 'Invitation cancelled' };
  }

  /** Invitations waiting for this player. */
  static async getMyInvites(userId: number) {
    const invites = await prisma.alliance_join_requests.findMany({
      where: { user_id: userId, status: 'PENDING', kind: 'INVITE' },
      include: {
        alliance: { select: { id: true, name: true, motto: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return invites.map((invite) => ({
      id: invite.id,
      created_at: invite.created_at,
      alliance: invite.alliance,
    }));
  }

  /**
   * The invited player accepts or declines. Accepting locks the alliance and
   * the player, re-checks the invitation and the membership limit, and joins
   * with the Member rank.
   */
  static async respondToInvite(
    inviteId: number,
    userId: number,
    accept: boolean,
  ) {
    const invite = await prisma.alliance_join_requests.findUnique({
      where: { id: inviteId },
      select: { alliance_id: true, user_id: true, kind: true, status: true },
    });
    if (
      !invite ||
      invite.user_id !== userId ||
      invite.kind !== 'INVITE' ||
      invite.status !== 'PENDING'
    ) {
      throw new Error('Invitation not found or already answered');
    }
    if (!accept) {
      await prisma.alliance_join_requests.updateMany({
        where: { id: inviteId, status: 'PENDING' },
        data: { status: 'REJECTED', moderated_by: userId },
      });
      return { message: 'Invitation declined' };
    }
    await prisma.$transaction(async (tx) => {
      await lockAllianceThenUsers(tx, invite.alliance_id, [userId]);
      const updated = await tx.alliance_join_requests.updateMany({
        where: { id: inviteId, status: 'PENDING', kind: 'INVITE' },
        data: { status: 'APPROVED', moderated_by: userId },
      });
      if (updated.count !== 1) {
        throw new Error('Invitation not found or already answered');
      }
      const alreadyMember = await tx.alliance_memberships.findFirst({
        where: { alliance_id: invite.alliance_id, user_id: userId },
        select: { id: true },
      });
      if (alreadyMember) {
        throw new Error('You are already a member of this alliance');
      }
      const membershipCount = await tx.alliance_memberships.count({
        where: { user_id: userId },
      });
      if (membershipCount >= MAX_ALLIANCE_MEMBERSHIPS) {
        throw new Error(
          `You can only be a member of ${MAX_ALLIANCE_MEMBERSHIPS} alliances`,
        );
      }
      const memberRole = await tx.alliance_roles.findFirst({
        where: { alliance_id: invite.alliance_id, name: 'Member' },
        select: { id: true },
      });
      if (!memberRole) throw new Error('Default role not found');
      await tx.alliance_memberships.create({
        data: {
          alliance_id: invite.alliance_id,
          user_id: userId,
          role_id: memberRole.id,
        },
      });
    }, ALLIANCE_BANK_TX_OPTIONS);
    return { message: 'Invitation accepted' };
  }

  /**
   * Gets pending join requests for an alliance
   */
  static async getJoinRequests(allianceId: number, userId: number) {
    try {
      // Check permissions
      const membership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: userId,
        },
        include: { role: true, alliance: true },
      });

      if (!membership) throw new Error('Not a member');

      const canView = hasAlliancePermission(
        membership.alliance.leader_id,
        userId,
        membership.role,
        'invite_member',
      );

      if (!canView) throw new Error('No permission');

      const requests = await prisma.alliance_join_requests.findMany({
        where: {
          alliance_id: allianceId,
          status: 'PENDING',
          kind: 'REQUEST',
        },
        include: {
          user: {
            select: {
              display_name: true,
              experience: true,
              race: true,
              class: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });

      // users has no level column; level is derived from experience.
      return requests.map(({ user, ...request }) => ({
        ...request,
        user: user && {
          display_name: user.display_name,
          race: user.race,
          class: user.class,
          level: getLevelFromXP(user.experience ?? 0),
        },
      }));
    } catch (error: any) {
      logError('Error getting join requests', { allianceId, error });
      throw error;
    }
  }

  /**
   * Searches for alliances with various filters
   */
  static async searchAlliances(filters: AllianceSearchFilters) {
    const validatedFilters = AllianceSearchSchema.parse(filters);

    try {
      return await this.getAllAlliances(validatedFilters);
    } catch (error: any) {
      logError('Error searching alliances', {
        filters: validatedFilters,
        error,
      });
      throw error;
    }
  }
}
