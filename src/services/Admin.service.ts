import { randomBytes } from 'crypto';
import md5 from 'md5';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { PermissionType } from '@/lib/prisma-exports';
import {
  checkStaffTargetAction,
  isAdmin,
  isModerator,
} from '@/utils/authorization';
import { resolveEraStartSettings } from '@/utils/eraStartSettings';
import { logError } from '@/utils/logger';

import { ensureActiveEra } from './Era.service';
import {
  buildDefaultUserUpdate,
  buildEraStartOverrides,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';

// Type definitions for admin operations
/** Describes the grant permission data contract. */
export interface GrantPermissionData {
  userIdentifier: string; // Can be username or email
  permission: PermissionType;
}

/** Describes the account action data contract. */
export interface AccountActionData {
  userId: number;
  action: 'SUSPENDED' | 'BANNED' | 'CLOSED' | 'ACTIVE';
  duration?: number; // Duration in days
  reason?: string;
}

/** Describes the admin account reset data contract. */
export interface AdminAccountResetData {
  userId: number;
  reason?: string;
}

/** Describes the vacation action data contract. */
export interface VacationActionData {
  userId: number;
  action: 'start' | 'end';
}

/** Describes the user list filter data contract. */
export interface UserListFilter {
  id?: number;
  username?: string;
  email?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sort?: 'id' | 'username' | 'email' | 'lastActive';
  order?: 'asc' | 'desc';
}

/** Describes the user update data contract. */
export interface UserUpdateData {
  profile: {
    username: string;
    email: string;
  };
  stats: {
    gold: string;
    experience: number;
    level?: number;
  };
  army: {
    units: Array<{
      id: string;
      type: string;
      quantity: number;
      level: number;
    }>;
  };
  items: {
    items: Array<{
      id: string;
      type: string;
      quantity: number;
      level?: number;
      usage?: string;
    }>;
  };
  permissions: {
    permissions: PermissionType[];
  };
}

// Zod schemas for validation
const GrantPermissionSchema = z.object({
  userIdentifier: z.string().min(1),
  permission: z.nativeEnum(PermissionType),
});

const AccountActionSchema = z.object({
  userId: z.number().int().positive(),
  action: z.enum(['SUSPENDED', 'BANNED', 'CLOSED', 'ACTIVE']),
  duration: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

const AdminAccountResetSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().optional(),
});

const VacationActionSchema = z.object({
  userId: z.number().int().positive(),
  action: z.enum(['start', 'end']),
});

const UserListFilterSchema = z.object({
  id: z.number().int().positive().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
  sort: z.enum(['id', 'username', 'email', 'lastActive']).default('id'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const UserUpdateDataSchema = z.object({
  profile: z.object({
    username: z.string().min(1),
    email: z.string().email(),
  }),
  stats: z.object({
    gold: z.string(),
    experience: z.number().int().nonnegative(),
    level: z.number().int().positive().optional(),
  }),
  army: z.object({
    units: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        quantity: z.number().int().nonnegative(),
        level: z.number().int().positive(),
      }),
    ),
  }),
  items: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        quantity: z.number().int().nonnegative(),
        level: z.number().int().positive().optional(),
        usage: z.string().optional(),
      }),
    ),
  }),
  permissions: z.object({
    permissions: z.array(z.nativeEnum(PermissionType)),
  }),
});

type TransactionClient = Prisma.TransactionClient;

/** Encapsulates admin data access and domain operations. */
export class AdminService {
  /**
   * Revokes staff roles and permission grants on an account that is being
   * reset or closed, and replaces its password hash so the old credentials
   * can no longer authenticate. Rows are soft-revoked (revokedAt) rather than
   * deleted so the account's staff history survives, which keeps staff-only
   * protections (such as the email-change lock) in force after a reopen.
   * Must run inside the caller's transaction.
   */
  static async revokeAccountAccess(tx: TransactionClient, userId: number) {
    const revokedAt = new Date();
    await tx.staffRoleAssignment.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
    await tx.permissionGrant.updateMany({
      where: { user_id: userId, revokedAt: null },
      data: { revokedAt },
    });
    await tx.users.update({
      where: { id: userId },
      data: { password_hash: randomBytes(32).toString('hex') },
    });
  }

  /**
   * Makes the user's active grants match `requested`: grants no longer wanted
   * are soft-revoked and missing ones are created. Existing active grants are
   * left untouched so their history is preserved.
   */
  static async syncPermissionGrants(
    tx: TransactionClient,
    userId: number,
    requested: PermissionType[],
    grantedByUserId?: number,
  ) {
    const wanted = Array.from(new Set(requested));
    await tx.permissionGrant.updateMany({
      where: { user_id: userId, revokedAt: null, type: { notIn: wanted } },
      data: { revokedAt: new Date() },
    });
    const active = await tx.permissionGrant.findMany({
      where: { user_id: userId, revokedAt: null },
      select: { type: true },
    });
    const activeTypes = new Set((active ?? []).map((g) => g.type));
    for (const type of wanted) {
      if (!activeTypes.has(type)) {
        await tx.permissionGrant.create({
          data: {
            user_id: userId,
            type,
            grantedByUserId: Number.isFinite(grantedByUserId)
              ? grantedByUserId
              : undefined,
          },
        });
      }
    }
  }

  /**
   * Checks if the current user has admin privileges
   */
  private static async checkAdminPermission(userId: number): Promise<boolean> {
    try {
      return await isAdmin(userId);
    } catch (error) {
      logError('Error checking admin permission', { userId, error });
      return false;
    }
  }

  /**
   * Finds a user by username or email
   */
  private static async findUserByIdentifier(identifier: string) {
    // Try to find by username first, then by email
    const user = await prisma.users.findFirst({
      where: {
        OR: [{ display_name: identifier }, { email: identifier.toLowerCase() }],
      },
      include: {
        permissions: { where: { revokedAt: null } },
      },
    });

    return user;
  }

  /**
   * Grants a permission to a user
   */
  static async grantPermission(adminUserId: number, data: GrantPermissionData) {
    const validatedData = GrantPermissionSchema.parse(data);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      // Find the target user
      const targetUser = await this.findUserByIdentifier(
        validatedData.userIdentifier,
      );
      if (!targetUser) {
        throw new Error('User not found');
      }

      // Check if user already has the permission
      const existingPermission = targetUser.permissions?.find(
        (perm) => perm.type === validatedData.permission,
      );

      if (existingPermission) {
        return {
          message: 'User already has that permission',
          userId: targetUser.id,
        };
      }

      // Grant the permission
      await prisma.permissionGrant.create({
        data: {
          user_id: targetUser.id,
          type: validatedData.permission,
        },
      });

      return {
        message: 'Successfully granted permission',
        userId: targetUser.id,
        permission: validatedData.permission,
      };
    } catch (error: any) {
      logError('Error granting permission', {
        adminUserId,
        targetUser: validatedData.userIdentifier,
        permission: validatedData.permission,
        error,
      });
      throw error;
    }
  }

  /**
   * Revokes a permission from a user
   */
  static async revokePermission(
    adminUserId: number,
    data: GrantPermissionData,
  ) {
    const validatedData = GrantPermissionSchema.parse(data);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      // Find the target user
      const targetUser = await this.findUserByIdentifier(
        validatedData.userIdentifier,
      );
      if (!targetUser) {
        throw new Error('User not found');
      }

      // Soft-revoke so the grant history is kept
      const result = await prisma.permissionGrant.updateMany({
        where: {
          user_id: targetUser.id,
          type: validatedData.permission,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      if (result.count === 0) {
        return {
          message: 'User does not have that permission to revoke',
          userId: targetUser.id,
        };
      }

      return {
        message: 'Successfully revoked permission',
        userId: targetUser.id,
        permission: validatedData.permission,
      };
    } catch (error: any) {
      logError('Error revoking permission', {
        adminUserId,
        targetUser: validatedData.userIdentifier,
        permission: validatedData.permission,
        error,
      });
      throw error;
    }
  }

  /**
   * Performs administrative actions on user accounts
   */
  static async performAccountAction(
    adminUserId: number,
    data: AccountActionData,
  ) {
    const validatedData = AccountActionSchema.parse(data);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      const now = new Date();
      let endDate = null;

      if (validatedData.duration && validatedData.action !== 'CLOSED') {
        endDate = new Date();
        endDate.setDate(now.getDate() + validatedData.duration);
      }

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${validatedData.userId} FOR UPDATE`;
        const denial = await checkStaffTargetAction(
          adminUserId,
          validatedData.userId,
          { client: tx },
        );
        if (denial) throw new Error(denial.error);
        // End current statuses
        await tx.accountStatusHistory.updateMany({
          where: {
            user_id: validatedData.userId,
            end_date: null,
          },
          data: {
            end_date: now,
          },
        });

        // Create new status entry
        await tx.accountStatusHistory.create({
          data: {
            user_id: validatedData.userId,
            status: validatedData.action,
            start_date: now,
            end_date: endDate,
            reason: validatedData.reason || `${validatedData.action} by admin`,
            admin_id: adminUserId,
          },
        });

        if (validatedData.action === 'CLOSED') {
          await this.revokeAccountAccess(tx, validatedData.userId);
        }
      });

      return {
        message: `User has been ${validatedData.action.toLowerCase()}`,
        action: validatedData.action,
        userId: validatedData.userId,
        duration: validatedData.duration,
        endDate,
      };
    } catch (error: any) {
      logError('Error performing account action', {
        adminUserId,
        userId: validatedData.userId,
        action: validatedData.action,
        error,
      });
      throw error;
    }
  }

  /**
   * Resets a user account to default state
   */
  static async resetAccount(
    adminUserId: number,
    data: AdminAccountResetData,
    options: {
      /** Runs inside the reset transaction, e.g. a required audit write. */
      beforeCommit?: (
        tx: TransactionClient,
        result: { oldUserId: number; newUserId: number },
      ) => Promise<void>;
    } = {},
  ) {
    const validatedData = AdminAccountResetSchema.parse(data);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${validatedData.userId} FOR UPDATE`;
        const denial = await checkStaffTargetAction(
          adminUserId,
          validatedData.userId,
          { client: tx },
        );
        if (denial) throw new Error(denial.error);
        // Fetch the user's current data
        const user = await tx.users.findUnique({
          where: { id: validatedData.userId },
          select: {
            email: true,
            password_hash: true,
            display_name: true,
            race: true,
            class: true,
            colorScheme: true,
            locale: true,
          },
        });

        if (!user) {
          throw new Error('User not found');
        }

        const activeEra = await ensureActiveEra(tx);
        const startSettings = resolveEraStartSettings(activeEra.startSettings);
        const anonymizedEmail = `${validatedData.userId}-reset@deleted.local`;
        const anonymizedDisplayName = `reset-user-${validatedData.userId}`;

        // Pseudonymize old account to free unique constraints
        await tx.users.update({
          where: { id: validatedData.userId },
          data: {
            email: anonymizedEmail,
            display_name: anonymizedDisplayName,
            colorScheme: resolveColorScheme(user.colorScheme, user.race),
          },
        });

        // Old account keeps no staff roles, grants or usable password.
        // The new account was created above from the captured hash.
        await this.revokeAccountAccess(tx, validatedData.userId);

        // Create a new user account with a new userId
        const newUser = await tx.users.create({
          data: {
            email: user.email,
            password_hash: user.password_hash,
            display_name: user.display_name,
            race: user.race,
            class: user.class,
            locale: user.locale,
            currentEraId: activeEra.id,
            colorScheme: resolveColorScheme(user.colorScheme, user.race),
            ...buildDefaultUserUpdate(buildEraStartOverrides(startSettings)),
          },
        });

        await tx.users.update({
          where: { id: newUser.id },
          data: { recruit_link: md5(newUser.id.toString()) },
        });

        await resetUserRelations(tx, newUser.id, startSettings);

        // Log the reset in AccountResetHistory
        await tx.accountResetHistory.create({
          data: {
            userId: validatedData.userId,
            resetDate: new Date(),
            newUserId: newUser.id,
            reason: validatedData.reason || 'Account reset by admin',
          },
        });

        // Set the old user's status to CLOSED
        await tx.accountStatusHistory.create({
          data: {
            user_id: validatedData.userId,
            status: 'CLOSED',
            start_date: new Date(),
            reason: 'Account reset and closed by admin',
            admin_id: adminUserId,
          },
        });

        await options.beforeCommit?.(tx, {
          oldUserId: validatedData.userId,
          newUserId: newUser.id,
        });

        return {
          message: 'Account has been reset',
          oldUserId: validatedData.userId,
          newUserId: newUser.id,
          reason: validatedData.reason,
        };
      });
    } catch (error: any) {
      logError('Error resetting account', {
        adminUserId,
        userId: validatedData.userId,
        reason: validatedData.reason,
        error,
      });
      throw error;
    }
  }

  /**
   * Manages vacation mode for users (admin-initiated)
   */
  static async manageUserVacation(
    adminUserId: number,
    data: VacationActionData,
  ) {
    const validatedData = VacationActionSchema.parse(data);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${validatedData.userId} FOR UPDATE`;
        const denial = await checkStaffTargetAction(
          adminUserId,
          validatedData.userId,
          { client: tx },
        );
        if (denial) throw new Error(denial.error);
        const now = new Date();
        const latestStatus = await tx.accountStatusHistory.findFirst({
          where: { user_id: validatedData.userId, start_date: { lte: now } },
          orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
          select: { status: true, end_date: true },
        });
        if (
          latestStatus &&
          ['BANNED', 'SUSPENDED', 'CLOSED'].includes(latestStatus.status) &&
          (!latestStatus.end_date || latestStatus.end_date > now)
        ) {
          throw new Error('Vacation cannot override an account restriction');
        }
        if (
          validatedData.action === 'end' &&
          latestStatus?.status !== 'VACATION'
        ) {
          throw new Error('Account is not in vacation mode');
        }

        if (validatedData.action === 'start') {
          const vacationEndDate = new Date();
          vacationEndDate.setDate(now.getDate() + 14); // 2 weeks

          await tx.accountStatusHistory.create({
            data: {
              user_id: validatedData.userId,
              status: 'VACATION',
              start_date: now,
              end_date: vacationEndDate,
              reason: 'Admin initiated vacation mode',
              admin_id: adminUserId,
            },
          });

          return {
            message: 'Vacation mode started for user',
            userId: validatedData.userId,
            vacationEndDate,
          };
        }
        if (validatedData.action === 'end') {
          // End current vacation status
          await tx.accountStatusHistory.updateMany({
            where: {
              user_id: validatedData.userId,
              status: 'VACATION',
              end_date: null,
            },
            data: {
              end_date: now,
            },
          });

          // Create a new ACTIVE status entry
          await tx.accountStatusHistory.create({
            data: {
              user_id: validatedData.userId,
              status: 'ACTIVE',
              start_date: now,
              reason: 'Vacation mode ended by admin',
              admin_id: adminUserId,
            },
          });

          return {
            message: 'Vacation mode ended for user',
            userId: validatedData.userId,
          };
        }
        throw new Error('Invalid action');
      });
    } catch (error: any) {
      logError('Error managing user vacation', {
        adminUserId,
        userId: validatedData.userId,
        action: validatedData.action,
        error,
      });
      throw error;
    }
  }

  /**
   * Lists users with filtering and pagination
   */
  static async listUsers(adminUserId: number, filters: UserListFilter) {
    const validatedFilters = UserListFilterSchema.parse(filters);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      // Build where clause based on provided filters
      const whereClause: any = {};

      if (validatedFilters.id) whereClause.id = validatedFilters.id;
      if (validatedFilters.username) {
        whereClause.display_name = {
          contains: validatedFilters.username,
          mode: 'insensitive',
        };
      }
      if (validatedFilters.email) {
        whereClause.email = {
          contains: validatedFilters.email,
          mode: 'insensitive',
        };
      }

      // Handle status filter if provided
      if (validatedFilters.status) {
        whereClause.statusHistories = {
          some: {
            status: validatedFilters.status,
            end_date: null, // Current status has no end date
          },
        };
      }

      // Define mapping for sort fields
      const sortFieldMapping: { [key: string]: string } = {
        id: 'id',
        username: 'display_name',
        email: 'email',
        lastActive: 'last_active',
      };

      // Build orderBy clause
      const orderByClause: any = {};
      if (sortFieldMapping[validatedFilters.sort]) {
        orderByClause[sortFieldMapping[validatedFilters.sort]] =
          validatedFilters.order;
      } else {
        orderByClause.id = 'asc';
      }

      // Query the database for users and total count in parallel
      const [users, total] = await Promise.all([
        prisma.users.findMany({
          where: whereClause,
          select: {
            id: true,
            display_name: true,
            email: true,
            last_active: true,
            statusHistories: {
              where: { end_date: null },
              orderBy: { start_date: 'desc' },
              take: 1,
              select: {
                status: true,
              },
            },
            permissions: {
              where: { revokedAt: null },
              select: {
                type: true,
              },
            },
          },
          orderBy: orderByClause,
          take: validatedFilters.limit,
          skip: validatedFilters.offset,
        }),
        prisma.users.count({
          where: whereClause,
        }),
      ]);

      // Format the response
      const formattedUsers = users.map((user) => ({
        id: user.id.toString(),
        username: user.display_name,
        email: user.email,
        status: user.statusHistories[0]?.status || 'ACTIVE',
        lastActive: user.last_active,
        permissions: user.permissions.map((p) => p.type),
      }));

      return {
        users: formattedUsers,
        total,
        filters: validatedFilters,
      };
    } catch (error: any) {
      logError('Error listing users', {
        adminUserId,
        filters: validatedFilters,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets detailed information about a specific user
   */
  static async getUserDetails(adminUserId: number, userId: number) {
    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      // Fetch basic user data
      const user = await prisma.users.findUnique({
        where: { id: userId },
        include: {
          permissions: {
            where: { revokedAt: null },
            select: { type: true },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Format the response
      const formattedResponse = {
        profile: {
          id: user.id.toString(),
          username: user.display_name,
          email: user.email,
          status: 'ACTIVE', // Default status if not available
          lastActive: user.last_active,
          joinDate: user.created_at,
        },
        stats: {
          gold: user?.gold?.toString() || '0',
          experience: user?.experience || 0,
          goldInBank: user?.gold_in_bank?.toString() || '0',
        },
        army: {
          units: user.units
            ? JSON.parse(JSON.stringify(user.units)).map((unit: any) => ({
                id: unit.type,
                name: unit.type,
                quantity: unit.quantity || 0,
                level: unit.level || 1,
                type: unit.type,
              }))
            : [],
        },
        items: {
          items: user.items
            ? JSON.parse(JSON.stringify(user.items)).map((item: any) => ({
                id: item.type,
                name: item.type,
                quantity: item.quantity || 0,
                level: item.level || undefined,
                type: item.type,
                usage: item.usage,
              }))
            : [],
        },
        permissions: {
          permissions: user.permissions?.map((p) => p.type) || [],
        },
      };

      return formattedResponse;
    } catch (error: any) {
      logError('Error getting user details', {
        adminUserId,
        userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Updates a user's information
   */
  static async updateUser(
    adminUserId: number,
    userId: number,
    data: UserUpdateData,
  ) {
    const validatedData = UserUpdateDataSchema.parse(data);

    // Check admin permission
    if (!(await this.checkAdminPermission(adminUserId))) {
      throw new Error('Unauthorized: Admin access required');
    }

    try {
      // Start a transaction for updating multiple tables
      await prisma.$transaction(async (tx) => {
        // Fetch current user data to update JSON fields
        const user = await tx.users.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new Error('User not found');
        }

        // Update profile
        await tx.users.update({
          where: { id: userId },
          data: {
            display_name: validatedData.profile.username,
            email: validatedData.profile.email,
          },
        });

        // Parse current units and items
        const currentUnits = user.units
          ? JSON.parse(JSON.stringify(user.units))
          : [];
        const currentItems = user.items
          ? JSON.parse(JSON.stringify(user.items))
          : [];

        // Update units
        for (const unit of validatedData.army.units) {
          const { type } = unit;
          const unitIndex = currentUnits.findIndex((u) => u.type === type);

          if (unitIndex >= 0) {
            // Update existing unit
            currentUnits[unitIndex].quantity = unit.quantity;
            currentUnits[unitIndex].level = unit.level;
          } else {
            // Add new unit
            currentUnits.push({
              type,
              level: unit.level,
              quantity: unit.quantity,
            });
          }
        }

        // Update items
        for (const item of validatedData.items.items) {
          const { type } = item;
          const usage = item.usage || 'GENERAL';

          const itemIndex = currentItems.findIndex((i) => i.type === type);

          if (itemIndex >= 0) {
            // Update existing item
            currentItems[itemIndex].quantity = item.quantity;
            if (item.level !== undefined)
              currentItems[itemIndex].level = item.level;
          } else {
            // Add new item
            currentItems.push({
              type,
              level: item.level,
              quantity: item.quantity,
              usage,
            });
          }
        }

        // Update the user with the modified JSON fields
        await tx.users.update({
          where: { id: userId },
          data: {
            units: currentUnits,
            items: currentItems,
            gold: BigInt(validatedData.stats.gold),
            experience: validatedData.stats.experience,
            rank: validatedData.stats.level,
          },
        });

        await this.syncPermissionGrants(
          tx,
          userId,
          validatedData.permissions.permissions,
          adminUserId,
        );
      });

      return {
        message: 'User updated successfully',
        userId,
      };
    } catch (error: any) {
      logError('Error updating user', {
        adminUserId,
        userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Checks if a user has administrative privileges
   */
  static async hasAdminPrivileges(userId: number): Promise<boolean> {
    return this.checkAdminPermission(userId);
  }

  /**
   * Checks if a user has moderator privileges
   */
  static async hasModeratorPrivileges(userId: number): Promise<boolean> {
    try {
      return await isModerator(userId);
    } catch (error) {
      logError('Error checking moderator permission', { userId, error });
      return false;
    }
  }
}
