import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

// Type definitions for alliance operations
export interface CreateAllianceData {
  name: string;
  avatar?: string;
  motto?: string;
  comments?: string;
  is_public?: boolean;
  require_auth?: boolean;
  closed_enrollment?: boolean;
}

export interface UpdateAllianceData {
  name?: string;
  avatar?: string;
  motto?: string;
  comments?: string;
  is_public?: boolean;
  require_auth?: boolean;
  closed_enrollment?: boolean;
  bannerimg?: string;
  slug?: string;
}

export interface JoinAllianceData {
  allianceId: number;
}

export interface LeaveAllianceData {
  allianceId: number;
}

export interface KickMemberData {
  allianceId: number;
  memberId: number;
}

export interface TransferLeadershipData {
  allianceId: number;
  newLeaderId: number;
}

export interface CreateRoleData {
  allianceId: number;
  name: string;
  permissions: {
    invite_member?: boolean;
    grant_access?: boolean;
    edit_ranks?: boolean;
    send_messages?: boolean;
    edit_profile?: boolean;
    manage_allies?: boolean;
    manage_enemies?: boolean;
    edit_list?: boolean;
    view_list?: boolean;
  };
}

export interface UpdateRoleData {
  name?: string;
  permissions?: {
    invite_member?: boolean;
    grant_access?: boolean;
    edit_ranks?: boolean;
    send_messages?: boolean;
    edit_profile?: boolean;
    manage_allies?: boolean;
    manage_enemies?: boolean;
    edit_list?: boolean;
    view_list?: boolean;
  };
}

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
  gold_in_bank: bigint;
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
    permissions: any;
  };
}

export interface AllianceRole {
  id: number;
  name: string;
  alliance_id: number;
  created_at: Date;
  updated_at: Date;
  permissions: any;
}

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
  is_public: z.boolean().optional(),
  require_auth: z.boolean().optional(),
  closed_enrollment: z.boolean().optional()
});

const UpdateAllianceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().optional(),
  motto: z.string().max(255).optional(),
  comments: z.string().max(1000).optional(),
  is_public: z.boolean().optional(),
  require_auth: z.boolean().optional(),
  closed_enrollment: z.boolean().optional(),
  bannerimg: z.string().optional(),
  slug: z.string().optional()
});

const JoinAllianceSchema = z.object({
  allianceId: z.number().int().positive()
});

const LeaveAllianceSchema = z.object({
  allianceId: z.number().int().positive()
});

const KickMemberSchema = z.object({
  allianceId: z.number().int().positive(),
  memberId: z.number().int().positive()
});

const TransferLeadershipSchema = z.object({
  allianceId: z.number().int().positive(),
  newLeaderId: z.number().int().positive()
});

const CreateRoleSchema = z.object({
  allianceId: z.number().int().positive(),
  name: z.string().min(1).max(50),
  permissions: z.object({
    invite_member: z.boolean().optional(),
    grant_access: z.boolean().optional(),
    edit_ranks: z.boolean().optional(),
    send_messages: z.boolean().optional(),
    edit_profile: z.boolean().optional(),
    manage_allies: z.boolean().optional(),
    manage_enemies: z.boolean().optional(),
    edit_list: z.boolean().optional(),
    view_list: z.boolean().optional()
  })
});

const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  permissions: z.object({
    invite_member: z.boolean().optional(),
    grant_access: z.boolean().optional(),
    edit_ranks: z.boolean().optional(),
    send_messages: z.boolean().optional(),
    edit_profile: z.boolean().optional(),
    manage_allies: z.boolean().optional(),
    manage_enemies: z.boolean().optional(),
    edit_list: z.boolean().optional(),
    view_list: z.boolean().optional()
  }).optional()
});

const AllianceSearchSchema = z.object({
  search: z.string().optional(),
  is_public: z.boolean().optional(),
  closed_enrollment: z.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

export class AllianceService {
  /**
   * Validates that a user can create an alliance
   */
  private static async validateAllianceCreation(userId: number, data: { name: string; avatar?: string; motto?: string; comments?: string; is_public?: boolean; require_auth?: boolean; closed_enrollment?: boolean; }) {
    // Check if user already leads an alliance
    const existingAlliance = await prisma.alliances.findFirst({
      where: { leader_id: userId }
    });

    if (existingAlliance) {
      throw new Error('You already lead an alliance');
    }

    // Check if user is already in an alliance
    const existingMembership = await prisma.alliance_memberships.findFirst({
      where: { user_id: userId }
    });

    if (existingMembership) {
      throw new Error('You are already a member of an alliance');
    }

    // Check if alliance name is already taken
    const existingAllianceWithName = await prisma.alliances.findFirst({
      where: { name: data.name }
    });

    if (existingAllianceWithName) {
      throw new Error('An alliance with this name already exists');
    }
  }

  /**
   * Creates a new alliance
   */
  static async createAlliance(userId: number, data: CreateAllianceData) {
    // Validate and ensure required fields
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Alliance name is required');
    }
    
    const validatedData = CreateAllianceSchema.parse(data) as CreateAllianceData;
    
    // After validation, ensure name is still present
    if (!validatedData.name) {
      throw new Error('Alliance name is required');
    }

    try {
      await this.validateAllianceCreation(userId, validatedData);

      // Get the user to check level and gold requirements
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { level: true, gold: true, display_name: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.level < 10) {
        throw new Error('User level must be at least 10');
      }

      const allianceCreationCost = BigInt(100000000); // 100 million gold
      if (user.gold < allianceCreationCost) {
        throw new Error('Insufficient gold to create alliance');
      }

      return await prisma.$transaction(async (tx) => {
        // Create the alliance
        const alliance = await tx.alliances.create({
          data: {
            name: validatedData.name,
            leader_id: userId,
            avatar: validatedData.avatar,
            motto: validatedData.motto,
            comments: validatedData.comments,
            is_public: validatedData.is_public ?? true,
            require_auth: validatedData.require_auth ?? false,
            closed_enrollment: validatedData.closed_enrollment ?? false,
          },
          include: {
            leader: {
              select: { display_name: true }
            },
            _count: {
              select: { members: true }
            }
          }
        });

        // Create default role
        const defaultRole = await tx.alliance_roles.create({
          data: {
            name: 'Member',
            alliance_id: alliance.id,
            permissions: {
              invite_member: false,
              grant_access: false,
              edit_ranks: false,
              send_messages: true,
              edit_profile: false,
              manage_allies: false,
              manage_enemies: false,
              edit_list: false,
              view_list: true
            }
          }
        });

        // Add leader as member with default role
        await tx.alliance_memberships.create({
          data: {
            alliance_id: alliance.id,
            user_id: userId,
            role_id: defaultRole.id
          }
        });

        // Deduct gold from user
        await tx.users.update({
          where: { id: userId },
          data: {
            gold: {
              decrement: allianceCreationCost
            }
          }
        });

        return alliance;
      });
    } catch (error: any) {
      logError('Error creating alliance', { userId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Gets all alliances with optional filtering and pagination
   */
  static async getAllAlliances(filters?: AllianceSearchFilters) {
    const validatedFilters = filters ? AllianceSearchSchema.parse(filters) : {};

    try {
      const whereCondition: any = {};

      if (validatedFilters.search) {
        whereCondition.OR = [
          { name: { contains: validatedFilters.search, mode: 'insensitive' } },
          { motto: { contains: validatedFilters.search, mode: 'insensitive' } },
          { comments: { contains: validatedFilters.search, mode: 'insensitive' } }
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
        orderBy: { created_at: 'desc' }
      });

      return stringifyObj(alliances);
    } catch (error: any) {
      logError('Error getting all alliances', { filters: validatedFilters, error });
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
                },
              },
            },
            orderBy: { created_at: 'asc' }
          },
          alliance_roles: {
            orderBy: { created_at: 'asc' }
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
   * Updates alliance information
   */
  static async updateAlliance(allianceId: number, leaderId: number, data: UpdateAllianceData) {
    const validatedData = UpdateAllianceSchema.parse(data);

    try {
      // Verify the user is the leader of the alliance
      const alliance = await prisma.alliances.findFirst({
        where: { id: allianceId, leader_id: leaderId }
      });

      if (!alliance) {
        throw new Error('Alliance not found or you are not the leader');
      }

      const updatedAlliance = await prisma.alliances.update({
        where: { id: allianceId },
        data: validatedData,
        include: {
          leader: {
            select: { display_name: true }
          },
          _count: {
            select: { members: true }
          }
        }
      });

      return updatedAlliance;
    } catch (error: any) {
      logError('Error updating alliance', { allianceId, leaderId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Deletes an alliance (only leader can delete)
   */
  static async deleteAlliance(allianceId: number, leaderId: number) {
    try {
      // Verify the user is the leader of the alliance
      const alliance = await prisma.alliances.findFirst({
        where: { id: allianceId, leader_id: leaderId }
      });

      if (!alliance) {
        throw new Error('Alliance not found or you are not the leader');
      }

      // Delete the alliance (cascade will handle memberships and roles)
      await prisma.alliances.delete({
        where: { id: allianceId }
      });

      return { message: 'Alliance deleted successfully' };
    } catch (error: any) {
      logError('Error deleting alliance', { allianceId, leaderId, error });
      throw error;
    }
  }

  /**
   * Allows a user to join an alliance
   */
  static async joinAlliance(userId: number, data: JoinAllianceData) {
    const validatedData = JoinAllianceSchema.parse(data);

    try {
      // Check if user is already in an alliance
      const existingMembership = await prisma.alliance_memberships.findFirst({
        where: { user_id: userId }
      });

      if (existingMembership) {
        throw new Error('You are already a member of an alliance');
      }

      // Get the alliance
      const alliance = await prisma.alliances.findUnique({
        where: { id: validatedData.allianceId },
        include: {
          alliance_roles: {
            where: { name: 'Member' },
            take: 1
          },
          _count: {
            select: { members: true }
          }
        }
      });

      if (!alliance) {
        throw new Error('Alliance not found');
      }

      if (alliance.closed_enrollment) {
        throw new Error('This alliance is not accepting new members');
      }

      if (!alliance.is_public) {
        throw new Error('This alliance is private');
      }

      const defaultRole = alliance.alliance_roles[0];
      if (!defaultRole) {
        throw new Error('No default member role found');
      }

      // Add user to alliance
      const membership = await prisma.alliance_memberships.create({
        data: {
          alliance_id: validatedData.allianceId,
          user_id: userId,
          role_id: defaultRole.id
        },
        include: {
          user: {
            select: {
              display_name: true
            }
          },
          role: {
            select: {
              name: true
            }
          }
        }
      });

      return {
        message: 'Successfully joined alliance',
        membership
      };
    } catch (error: any) {
      logError('Error joining alliance', { userId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Allows a user to leave an alliance
   */
  static async leaveAlliance(userId: number, data: LeaveAllianceData) {
    const validatedData = LeaveAllianceSchema.parse(data);

    try {
      // Get the membership
      const membership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: validatedData.allianceId,
          user_id: userId
        },
        include: {
          alliance: true
        }
      });

      if (!membership) {
        throw new Error('You are not a member of this alliance');
      }

      // Check if user is the leader
      if (membership.alliance.leader_id === userId) {
        throw new Error('Alliance leaders cannot leave their alliance. Transfer leadership first.');
      }

      // Remove membership
      await prisma.alliance_memberships.delete({
        where: {
          id: membership.id
        }
      });

      return { message: 'Successfully left alliance' };
    } catch (error: any) {
      logError('Error leaving alliance', { userId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Kicks a member from an alliance (leader or admin role only)
   */
  static async kickMember(allianceId: number, kickerId: number, data: KickMemberData) {
    const validatedData = KickMemberSchema.parse(data);

    try {
      // Verify kicker is a member of the alliance with appropriate permissions
      const kickerMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: kickerId
        },
        include: {
          role: true,
          alliance: true
        }
      });

      if (!kickerMembership) {
        throw new Error('You are not a member of this alliance');
      }

      // Check permissions
      const canKick = kickerMembership.role.permissions?.edit_ranks || 
                     kickerMembership.alliance.leader_id === kickerId;

      if (!canKick) {
        throw new Error('You do not have permission to kick members');
      }

      // Get the member to be kicked
      const memberToKick = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: validatedData.memberId
        },
        include: {
          alliance: true
        }
      });

      if (!memberToKick) {
        throw new Error('Member not found in alliance');
      }

      // Can't kick the leader
      if (memberToKick.alliance.leader_id === validatedData.memberId) {
        throw new Error('Cannot kick the alliance leader');
      }

      // Remove membership
      await prisma.alliance_memberships.delete({
        where: {
          id: memberToKick.id
        }
      });

      return { message: 'Member kicked successfully' };
    } catch (error: any) {
      logError('Error kicking member', { allianceId, kickerId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Transfers alliance leadership to another member
   */
  static async transferLeadership(allianceId: number, currentLeaderId: number, data: TransferLeadershipData) {
    const validatedData = TransferLeadershipSchema.parse(data);

    try {
      // Verify current user is the leader
      const alliance = await prisma.alliances.findFirst({
        where: { 
          id: allianceId, 
          leader_id: currentLeaderId 
        }
      });

      if (!alliance) {
        throw new Error('Alliance not found or you are not the leader');
      }

      // Verify the new leader is a member of the alliance
      const newLeaderMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: validatedData.newLeaderId
        }
      });

      if (!newLeaderMembership) {
        throw new Error('New leader must be a member of the alliance');
      }

      // Update alliance leadership
      const updatedAlliance = await prisma.alliances.update({
        where: { id: allianceId },
        data: { leader_id: validatedData.newLeaderId },
        include: {
          leader: {
            select: { display_name: true }
          },
          _count: {
            select: { members: true }
          }
        }
      });

      return {
        message: 'Leadership transferred successfully',
        alliance: updatedAlliance
      };
    } catch (error: any) {
      logError('Error transferring leadership', { allianceId, currentLeaderId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Gets alliance membership for a specific user
   */
  static async getUserAllianceMembership(userId: number) {
    try {
      const membership = await prisma.alliance_memberships.findFirst({
        where: { user_id: userId },
        include: {
          alliance: {
            include: {
              leader: {
                select: { display_name: true }
              },
              _count: {
                select: { members: true }
              }
            }
          },
          role: {
            select: {
              name: true,
              permissions: true
            }
          }
        }
      });

      return membership;
    } catch (error: any) {
      logError('Error getting user alliance membership', { userId, error });
      throw error;
    }
  }

  /**
   * Creates a new alliance role
   */
  static async createRole(allianceId: number, creatorId: number, data: CreateRoleData) {
    const validatedData = CreateRoleSchema.parse(data);

    try {
      // Verify creator is alliance leader or has role management permissions
      const creatorMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: creatorId
        },
        include: {
          role: true,
          alliance: true
        }
      });

      if (!creatorMembership) {
        throw new Error('You are not a member of this alliance');
      }

      const canManageRoles = creatorMembership.role.permissions?.edit_ranks || 
                           creatorMembership.alliance.leader_id === creatorId;

      if (!canManageRoles) {
        throw new Error('You do not have permission to manage roles');
      }

      const role = await prisma.alliance_roles.create({
        data: {
          name: validatedData.name,
          alliance_id: allianceId,
          permissions: validatedData.permissions
        }
      });

      return role;
    } catch (error: any) {
      logError('Error creating alliance role', { allianceId, creatorId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Updates an alliance role
   */
  static async updateRole(allianceId: number, roleId: number, updaterId: number, data: UpdateRoleData) {
    const validatedData = UpdateRoleSchema.parse(data);

    try {
      // Verify updater has permissions
      const updaterMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: updaterId
        },
        include: {
          role: true,
          alliance: true
        }
      });

      if (!updaterMembership) {
        throw new Error('You are not a member of this alliance');
      }

      const canManageRoles = updaterMembership.role.permissions?.edit_ranks || 
                           updaterMembership.alliance.leader_id === updaterId;

      if (!canManageRoles) {
        throw new Error('You do not have permission to manage roles');
      }

      // Update the role
      const updatedRole = await prisma.alliance_roles.update({
        where: { id: roleId },
        data: validatedData
      });

      return updatedRole;
    } catch (error: any) {
      logError('Error updating alliance role', { allianceId, roleId, updaterId, data: validatedData, error });
      throw error;
    }
  }

  /**
   * Deletes an alliance role
   */
  static async deleteRole(allianceId: number, roleId: number, deleterId: number) {
    try {
      // Verify deleter has permissions
      const deleterMembership = await prisma.alliance_memberships.findFirst({
        where: {
          alliance_id: allianceId,
          user_id: deleterId
        },
        include: {
          role: true,
          alliance: true
        }
      });

      if (!deleterMembership) {
        throw new Error('You are not a member of this alliance');
      }

      const canManageRoles = deleterMembership.role.permissions?.edit_ranks || 
                           deleterMembership.alliance.leader_id === deleterId;

      if (!canManageRoles) {
        throw new Error('You do not have permission to manage roles');
      }

      // Check if role is in use
      const roleUsage = await prisma.alliance_memberships.count({
        where: { role_id: roleId }
      });

      if (roleUsage > 0) {
        throw new Error('Cannot delete role that is assigned to members');
      }

      // Delete the role
      await prisma.alliance_roles.delete({
        where: { id: roleId }
      });

      return { message: 'Role deleted successfully' };
    } catch (error: any) {
      logError('Error deleting alliance role', { allianceId, roleId, deleterId, error });
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
          where: { alliance_id: allianceId }
        }),
        prisma.alliance_roles.count({
          where: { alliance_id: allianceId }
        }),
        prisma.alliance_memberships.count({
          where: {
            alliance_id: allianceId,
            created_at: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          }
        })
      ]);

      return {
        totalMembers,
        totalRoles,
        recentJoins
      };
    } catch (error: any) {
      logError('Error getting alliance stats', { allianceId, error });
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
      logError('Error searching alliances', { filters: validatedFilters, error });
      throw error;
    }
  }
}