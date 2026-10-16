import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import {
  ItemType,
  ItemUsage,
  PermissionType,
  UnitType,
} from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import { AdminService } from '@/services/Admin.service';
import type { AuthenticatedRequest } from '@/types/api'; // Import the shared type
import { deriveAdminUserStatus } from '@/utils/adminStatus';
import { getRequestIp, logAction, logActionStrict } from '@/utils/auditLogger';
import { countOtherAdministrators } from '@/utils/authorization';
import { logError } from '@/utils/logger';
import { getLevelFromXP } from '@/utils/utilities';

const AdminUserQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const MONEY_MAX = 9223372036854775807n;
const MoneySchema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
  .transform((value) => BigInt(value))
  .refine((value) => value <= MONEY_MAX, 'Amount is too large');
const QuantitySchema = z.number().int().min(0).max(2147483647);
const AdminUserUpdateSchema = z.object({
  profile: z.object({
    username: z.string().trim().min(3).max(100),
    email: z.string().trim().email(),
  }),
  stats: z.object({
    gold: MoneySchema,
    goldInBank: MoneySchema.optional(),
    experience: QuantitySchema,
  }),
  army: z.object({
    units: z
      .array(
        z.object({
          id: z.string(),
          type: z.nativeEnum(UnitType),
          level: z.number().int().min(1).max(100),
          isMercenary: z.boolean().default(false),
          quantity: QuantitySchema,
        }),
      )
      .max(1000),
  }),
  items: z.object({
    items: z
      .array(
        z.object({
          id: z.string(),
          type: z.nativeEnum(ItemType),
          usage: z.nativeEnum(ItemUsage),
          level: z.number().int().min(1).max(100),
          quantity: QuantitySchema,
        }),
      )
      .max(1000),
  }),
  permissions: z.object({
    permissions: z.array(z.nativeEnum(PermissionType)).max(100),
  }),
  staffRoles: z
    .object({
      roles: z
        .array(
          z.enum([
            'ADMINISTRATOR',
            'MODERATOR',
            'COMMUNITY_MANAGER',
            'GAME_MASTER',
          ]),
        )
        .max(4),
    })
    .optional(),
});
const guardedRead = withApiGuard({
  methods: ['GET'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_USERS],
  rateLimitProfile: 'admin',
  querySchema: AdminUserQuerySchema,
});
const guardedUpdate = withApiGuard({
  methods: ['PUT'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: AdminUserQuerySchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof AdminUserQuerySchema> },
) {
  const { userId: userIdNum } = context.query;

  // GET - Fetch user details
  if (req.method === 'GET') {
    try {
      // Fetch basic user data
      const user = await prisma.users.findUnique({
        where: { id: userIdNum },
        include: {
          UserUnit: true,
          UserItem: true,
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
            select: { type: true },
          },
          staffRoleAssignments: {
            where: { revokedAt: null },
            select: { role: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const activeEra = await prisma.era.findFirst({
        where: { endDate: null },
        orderBy: { startDate: 'desc' },
        select: { id: true },
      });

      // Format the response
      const formattedResponse = {
        profile: {
          id: user.id.toString(),
          username: user.display_name,
          email: user.email,
          status: deriveAdminUserStatus({
            latestStatus: user.statusHistories?.[0]?.status,
            lastActive: user.last_active,
            currentEraId: user.currentEraId,
            activeEraId: activeEra?.id ?? null,
          }),
          lastActive: user.last_active,
          joinDate: user.created_at,
        },
        stats: {
          gold: user?.gold.toString() || 0,
          experience: user?.experience || 0,
          goldInBank: user?.gold_in_bank.toString() || 0,
          level: getLevelFromXP(user.experience ?? 0),
        },
        army: {
          units: (user.UserUnit ?? []).map((unit) => ({
            id: `${unit.type}:${unit.level}:${unit.isMercenary}`,
            name: unit.type,
            type: unit.type,
            quantity: unit.quantity,
            level: unit.level,
            isMercenary: unit.isMercenary,
          })),
        },
        items: {
          items: (user.UserItem ?? []).map((item) => ({
            id: `${item.type}:${item.usage}:${item.level}`,
            name: item.type,
            type: item.type,
            usage: item.usage,
            quantity: item.quantity,
            level: item.level,
          })),
        },
        permissions: {
          permissions: user.permissions?.map((p) => p.type) || [],
        },
        staffRoles: {
          roles: user.staffRoleAssignments?.map((a) => a.role) || [],
        },
      };

      res.status(200).json(formattedResponse);
    } catch (error) {
      logError('Error fetching user details:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  }
  // PUT - Update user
  else if (req.method === 'PUT') {
    const adminUserId = Number(req.session?.user?.id);
    const ip = getRequestIp(req);
    const auditDetails: Record<string, unknown> = { targetUserId: userIdNum };
    let auditAction = 'ADMIN_USER_UPDATE_FAILED';
    let status = 500;
    let body: { message?: string; error?: string } = {
      error: 'Failed to update user',
    };

    try {
      const parsed = AdminUserUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(422).json({
          error: 'Invalid user update',
          details: parsed.error.flatten().fieldErrors,
        });
      const updateData = parsed.data;
      const unitIds = updateData.army.units.map((unit) => unit.id);
      const itemIds = updateData.items.items.map((item) => item.id);
      if (
        new Set(unitIds).size !== unitIds.length ||
        new Set(itemIds).size !== itemIds.length
      ) {
        return res
          .status(422)
          .json({ error: 'Duplicate inventory identities' });
      }
      const denial = await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userIdNum} FOR UPDATE`;
          // Fetch current user data to update JSON fields
          const user = await tx.users.findUnique({
            where: { id: userIdNum },
          });

          if (!user) {
            throw new Error('User not found');
          }

          // Deliberately unfiltered by revokedAt: an account that has ever held
          // a role or grant stays locked, so revoke-then-edit cannot bypass it.
          const staffRows = await tx.staffRoleAssignment.findMany({
            where: { userId: userIdNum },
            select: { role: true, revokedAt: true },
          });
          const grantCount = await tx.permissionGrant.count({
            where: { user_id: userIdNum },
          });

          const isSelf = adminUserId === userIdNum;
          const targetIsAdmin = staffRows.some(
            (row) => row.role === 'ADMINISTRATOR' && row.revokedAt === null,
          );
          const emailChanged =
            updateData.profile.email.trim().toLowerCase() !==
            (user.email ?? '').trim().toLowerCase();
          const holdsStaffOrGrant = staffRows.length > 0 || grantCount > 0;

          auditDetails.emailChanged = emailChanged;
          auditDetails.targetIsStaff = holdsStaffOrGrant;

          // Administrators may not edit other administrators at all.
          if (!isSelf && targetIsAdmin) {
            auditDetails.reason = 'admin_on_admin';
            return {
              status: 403,
              error: 'Administrators cannot edit other administrators',
            };
          }

          // Dropping your own ADMINISTRATOR role must not leave nobody in charge.
          const dropsOwnAdmin =
            isSelf &&
            targetIsAdmin &&
            !!updateData.staffRoles &&
            !updateData.staffRoles.roles.includes('ADMINISTRATOR');
          if (
            dropsOwnAdmin &&
            (await countOtherAdministrators(userIdNum, tx)) === 0
          ) {
            auditDetails.reason = 'last_administrator';
            return {
              status: 409,
              error: 'The last administrator cannot remove their own role',
            };
          }

          // Email changes on staff accounts enable takeover via password reset.
          if (emailChanged && holdsStaffOrGrant) {
            auditDetails.reason = 'staff_email_change';
            return {
              status: 403,
              error:
                'Email cannot be changed on staff or permissioned accounts',
            };
          }

          // Update profile
          await tx.users.update({
            where: { id: userIdNum },
            data: {
              display_name: updateData.profile.username,
              email: updateData.profile.email,
            },
          });

          // Quantity edits target exact normalized rows; unrelated levels/usages are preserved.
          for (const unit of updateData.army.units) {
            if (unit.id !== `${unit.type}:${unit.level}:${unit.isMercenary}`)
              throw new Error('Invalid unit identity');
            const result = await tx.userUnit.updateMany({
              where: {
                userId: userIdNum,
                type: unit.type,
                level: unit.level,
                isMercenary: unit.isMercenary,
              },
              data: { quantity: unit.quantity },
            });
            if (result.count !== 1) throw new Error('Unit no longer exists');
          }
          for (const item of updateData.items.items) {
            if (item.id !== `${item.type}:${item.usage}:${item.level}`)
              throw new Error('Invalid item identity');
            const result = await tx.userItem.updateMany({
              where: {
                userId: userIdNum,
                type: item.type,
                usage: item.usage,
                level: item.level,
              },
              data: { quantity: item.quantity },
            });
            if (result.count !== 1) throw new Error('Item no longer exists');
          }
          await tx.users.update({
            where: { id: userIdNum },
            data: {
              gold: updateData.stats.gold,
              ...(updateData.stats.goldInBank !== undefined
                ? { gold_in_bank: updateData.stats.goldInBank }
                : {}),
              experience: updateData.stats.experience,
            },
          });

          // Removed grants are soft-revoked so the staff history is kept.
          await AdminService.syncPermissionGrants(
            tx,
            userIdNum,
            updateData.permissions.permissions,
            adminUserId,
          );

          if (updateData.staffRoles) {
            const requestedRoles = updateData.staffRoles.roles;

            await tx.staffRoleAssignment.updateMany({
              where: {
                userId: userIdNum,
                revokedAt: null,
                role: { notIn: requestedRoles },
              },
              data: { revokedAt: new Date() },
            });

            for (const role of requestedRoles) {
              const existingAssignment = await tx.staffRoleAssignment.findFirst(
                {
                  where: { userId: userIdNum, role, revokedAt: null },
                  select: { id: true },
                },
              );

              if (!existingAssignment) {
                await tx.staffRoleAssignment.create({
                  data: {
                    userId: userIdNum,
                    role,
                    grantedByUserId: Number.isFinite(adminUserId)
                      ? adminUserId
                      : undefined,
                  },
                });
              }
            }
          }

          // Commits with the edit; a failed write rolls the edit back.
          await logActionStrict(
            {
              userId: adminUserId,
              action: 'ADMIN_USER_UPDATE',
              ip,
              targetUserId: userIdNum,
              details: auditDetails,
            },
            tx,
          );
          return null;
        },
        { isolationLevel: 'Serializable' },
      );

      if (denial) {
        auditAction = 'ADMIN_USER_UPDATE_DENIED';
        status = denial.status;
        body = { error: denial.error };
      } else {
        auditAction = 'ADMIN_USER_UPDATE';
        status = 200;
        body = { message: 'User updated successfully' };
      }
    } catch (error) {
      logError('Error updating user:', error);
    }

    // Successful updates are already audited inside the transaction.
    if (auditAction !== 'ADMIN_USER_UPDATE') {
      await logAction(adminUserId, auditAction, ip, auditDetails);
    }
    res.status(status).json(body);
  }
}

export default async function routed(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') return guardedRead(handler)(req, res);
  if (req.method === 'PUT') return guardedUpdate(handler)(req, res);
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
