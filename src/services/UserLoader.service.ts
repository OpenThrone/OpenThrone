import type { Prisma, users as PrismaUser } from '@prisma/client';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

const UserIdSchema = z.number().int().positive();
const UserSchema = z.object({
  id: z.number().int().positive(),
});

/**
 * Fetch a user with the standard set of relations used across services.
 * Use this helper whenever creating a UserModel from DB state to avoid
 * missing relation includes and subtle bugs.
 */
export const getUserWithAllRelations = async (userId: number) => {
  const validatedUserId = UserIdSchema.parse(userId);
  return prisma.users.findUnique({
    where: { id: validatedUserId },
    include: {
      UserUnit: true,
      UserItem: true,
      UserStructureUpgrade: true,
      UserBattleUpgrade: true,
      UserBonusPoints: true,
      permissions: true,
    },
  });
};

export const getUsersWithRelations = async (
  where = {},
  db: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  return db.users.findMany({
    where,
    include: {
      UserUnit: true,
      UserItem: true,
      UserStructureUpgrade: true,
      UserBattleUpgrade: true,
      UserBonusPoints: true,
      permissions: true,
    },
  });
};

/**
 * Build a UserModel instance from either a user id or a partial/full Prisma user row.
 * If the provided row is missing relation arrays, we'll fetch them from the DB.
 */
export const buildUserModel = async (
  userOrId: number | Partial<PrismaUser> | null,
  filtered = true,
  checkStats = true,
) => {
  if (!userOrId) return new UserModel(null as any);

  // If caller supplied an id, fetch full row
  let row: Partial<PrismaUser> | null = null;
  if (typeof userOrId === 'number') {
    const validatedUserId = UserIdSchema.parse(userOrId);
    row = await getUserWithAllRelations(validatedUserId);
  } else {
    row = userOrId;
  }

  if (!row) return new UserModel(null as any);

  // Ensure relations exist; if not present, fetch them
  const hasUnits =
    Array.isArray((row as any).UserUnit) || Array.isArray((row as any).units);
  const hasItems =
    Array.isArray((row as any).UserItem) || Array.isArray((row as any).items);
  const hasStructures =
    Array.isArray((row as any).UserStructureUpgrade) ||
    Array.isArray((row as any).structure_upgrades);
  const hasBattle =
    Array.isArray((row as any).UserBattleUpgrade) ||
    Array.isArray((row as any).battle_upgrades);
  const hasBonus =
    Array.isArray((row as any).UserBonusPoints) ||
    Array.isArray((row as any).bonus_points);

  if (hasUnits && hasItems && hasStructures && hasBattle && hasBonus) {
    return new UserModel(
      row as any,
      (row as any).UserUnit,
      (row as any).UserItem,
      (row as any).UserStructureUpgrade,
      (row as any).UserBattleUpgrade,
      (row as any).UserBonusPoints,
      (row as any).permissions,
      (row as any).stats,
      filtered,
      checkStats,
    );
  }

  // Fetch fresh row with relations
  const full = await getUserWithAllRelations(row.id);
  if (!full) return new UserModel(row as any);

  return new UserModel(
    full,
    full.UserUnit,
    full.UserItem,
    full.UserStructureUpgrade,
    full.UserBattleUpgrade,
    full.UserBonusPoints,
    full.permissions,
    full.stats,
    filtered,
    checkStats,
  );
};
