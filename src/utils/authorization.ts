import type { PermissionType, StaffRole } from '@prisma/client';

import prisma from '@/lib/prisma';

const ADMINISTRATOR_ROLE: StaffRole = 'ADMINISTRATOR';
const MODERATOR_ROLE: StaffRole = 'MODERATOR';

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

export const hasStaffRole = async (
  userId: number,
  role: StaffRole,
): Promise<boolean> => {
  const assignment = await prisma.staffRoleAssignment.findFirst({
    where: { userId, role, revokedAt: null },
  });
  return !!assignment;
};

export const getActiveStaffRoles = async (
  userId: number,
): Promise<StaffRole[]> => {
  const assignments = await prisma.staffRoleAssignment.findMany({
    where: { userId, revokedAt: null },
    select: { role: true },
  });
  return assignments.map((a) => a.role);
};

export const getActivePermissions = async (
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

export const hasPermission = async (
  userId: number,
  permission: PermissionType,
): Promise<boolean> => {
  const permissions = await getActivePermissions(userId);
  return permissions.includes(permission);
};

export const hasAnyPermission = async (
  userId: number,
  permissions: PermissionType[],
): Promise<boolean> => {
  const userPerms = await getActivePermissions(userId);
  const userSet = new Set(userPerms);
  return permissions.some((p) => userSet.has(p));
};

export const hasAllPermissions = async (
  userId: number,
  permissions: PermissionType[],
): Promise<boolean> => {
  const userPerms = await getActivePermissions(userId);
  const userSet = new Set(userPerms);
  return permissions.every((p) => userSet.has(p));
};
