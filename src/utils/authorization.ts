import prisma from '@/lib/prisma';
import type { PermissionType, StaffRole } from '@/lib/prisma-exports';

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
