import prisma from '@/lib/prisma';
import type { PermissionType, Prisma, StaffRole } from '@/lib/prisma-exports';

const ADMINISTRATOR_ROLE: StaffRole = 'ADMINISTRATOR';
const MODERATOR_ROLE: StaffRole = 'MODERATOR';

/**
 * Checks whether a user currently has an active administrator staff role assignment.
 */
export const isAdmin = async (userId: number): Promise<boolean> => {
  const assignment = await prisma.staffRoleAssignment.findFirst({
    where: {
      userId,
      role: ADMINISTRATOR_ROLE,
      revokedAt: null,
    },
  });
  return !!assignment;
};

/**
 * Checks whether a user currently has an active moderator staff role assignment.
 */
export const isModerator = async (userId: number): Promise<boolean> => {
  const assignment = await prisma.staffRoleAssignment.findFirst({
    where: {
      userId,
      role: MODERATOR_ROLE,
      revokedAt: null,
    },
  });
  return !!assignment;
};

const hasStaffRole = async (
  userId: number,
  role: StaffRole,
): Promise<boolean> => {
  const assignment = await prisma.staffRoleAssignment.findFirst({
    where: { userId, role, revokedAt: null },
  });
  return !!assignment;
};

const getActiveStaffRoles = async (userId: number): Promise<StaffRole[]> => {
  const assignments = await prisma.staffRoleAssignment.findMany({
    where: { userId, revokedAt: null },
    select: { role: true },
  });
  return assignments.map((a) => a.role);
};

const getActivePermissions = async (
  userId: number,
): Promise<PermissionType[]> => {
  const [roles, grants] = await Promise.all([
    getActiveStaffRoles(userId),
    prisma.permissionGrant.findMany({
      where: { user_id: userId, revokedAt: null },
      select: { type: true },
    }),
  ]);

  const { expandPermissions } = await import('./permissions');
  return expandPermissions(
    roles,
    grants.map((g) => g.type),
  );
};

const hasPermission = async (
  userId: number,
  permission: PermissionType,
): Promise<boolean> => {
  const permissions = await getActivePermissions(userId);
  return permissions.includes(permission);
};

/**
 * Checks whether a user has at least one of the requested expanded permissions.
 */
export const hasAnyPermission = async (
  userId: number,
  permissions: PermissionType[],
): Promise<boolean> => {
  const userPerms = await getActivePermissions(userId);
  const userSet = new Set(userPerms);
  return permissions.some((p) => userSet.has(p));
};

/**
 * Checks whether a user has every requested expanded permission.
 */
export const hasAllPermissions = async (
  userId: number,
  permissions: PermissionType[],
): Promise<boolean> => {
  const userPerms = await getActivePermissions(userId);
  const userSet = new Set(userPerms);
  return permissions.every((p) => userSet.has(p));
};

/** Rank used to compare staff accounts; a bare permission grant counts as 1. */
const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  ADMINISTRATOR: 3,
  MODERATOR: 2,
  COMMUNITY_MANAGER: 1,
  GAME_MASTER: 1,
};
const ADMINISTRATOR_RANK = STAFF_ROLE_RANK.ADMINISTRATOR;

type StaffLookupClient = Pick<
  Prisma.TransactionClient,
  'staffRoleAssignment' | 'permissionGrant'
>;

/**
 * Returns the highest active staff rank held by a user: 3 administrator,
 * 2 moderator, 1 other staff role or any permission grant, 0 player.
 */
export const getStaffRank = async (
  userId: number,
  client: StaffLookupClient = prisma,
): Promise<number> => {
  const [roles, grants] = await Promise.all([
    client.staffRoleAssignment.findMany({
      where: { userId, revokedAt: null },
      select: { role: true },
    }),
    client.permissionGrant.findMany({
      where: { user_id: userId, revokedAt: null },
      select: { type: true },
    }),
  ]);
  const roleRank = Math.max(
    0,
    ...(roles ?? []).map((r) => STAFF_ROLE_RANK[r.role] ?? 0),
  );
  return roleRank > 0 ? roleRank : (grants ?? []).length > 0 ? 1 : 0;
};

/** Why a staff action against another account was refused. */
export interface StaffTargetDenial {
  status: 403;
  reason: 'self_action' | 'admin_target' | 'staff_target';
  error: string;
}

/**
 * Refuses staff actions that would let one staff member take over or lock out
 * another of equal or higher rank. Administrators are never valid targets for
 * another account, and self-targeting is refused unless `allowSelf` is set
 * (closing, banning, resetting or vacationing yourself locks you out).
 */
export const checkStaffTargetAction = async (
  actorId: number,
  targetId: number,
  options: { allowSelf?: boolean; client?: StaffLookupClient } = {},
): Promise<StaffTargetDenial | null> => {
  const { allowSelf = false, client = prisma } = options;
  if (actorId === targetId) {
    return allowSelf
      ? null
      : {
          status: 403,
          reason: 'self_action',
          error: 'You cannot perform this action on your own account',
        };
  }

  const [actorRank, targetRank] = await Promise.all([
    getStaffRank(actorId, client),
    getStaffRank(targetId, client),
  ]);

  if (targetRank >= ADMINISTRATOR_RANK) {
    return {
      status: 403,
      reason: 'admin_target',
      error: 'This action cannot be performed on an administrator account',
    };
  }
  if (targetRank > 0 && targetRank >= actorRank) {
    return {
      status: 403,
      reason: 'staff_target',
      error: 'This action cannot be performed on staff of equal or higher rank',
    };
  }
  return null;
};

/**
 * Counts administrators other than `userId`; used to refuse changes that would
 * leave the game without an active administrator.
 */
export const countOtherAdministrators = async (
  userId: number,
  client: Pick<Prisma.TransactionClient, 'staffRoleAssignment'> = prisma,
): Promise<number> => {
  const rows = await client.staffRoleAssignment.findMany({
    where: {
      role: ADMINISTRATOR_ROLE,
      revokedAt: null,
      userId: { not: userId },
    },
    select: { userId: true },
  });
  return new Set((rows ?? []).map((r) => r.userId)).size;
};

/** True when the session was created by an administrator impersonating a user. */
export const isImpersonatedSession = (session: unknown): boolean => {
  const impersonatedBy = Number(
    (session as { user?: { impersonatedBy?: unknown } } | null | undefined)
      ?.user?.impersonatedBy,
  );
  return Number.isFinite(impersonatedBy) && impersonatedBy > 0;
};
