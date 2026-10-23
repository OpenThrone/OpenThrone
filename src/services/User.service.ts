import md5 from 'md5';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { resolveEraStartSettings } from '@/utils/eraStartSettings';
import { sanitizeUserForResponse } from '@/utils/sanitizeUser';
import { idleThresholdDate } from '@/utils/utilities';

import { ensureActiveEra } from './Era.service';
import {
  buildDefaultUserUpdate,
  buildEraStartOverrides,
  resetUserRelations,
  resolveColorScheme,
} from './UserDefaults.service';

const CreateUserSchema = z.object({
  email: z.string().email(),
  password_hash: z.string(),
  display_name: z.string(),
  race: z.string(),
  class_name: z.string(),
  locale: z.string().optional(),
});

/** Create user. */
export const createUser = async (
  email: string,
  password_hash: string,
  display_name: string,
  race: string,
  class_name: string,
  locale: string = 'en-US',
) => {
  const validatedData = CreateUserSchema.parse({
    email,
    password_hash,
    display_name,
    race,
    class_name,
    locale,
  });
  return await prisma.$transaction(async (tx) => {
    const activeEra = await ensureActiveEra(tx);
    const startSettings = resolveEraStartSettings(activeEra.startSettings);

    const user = await tx.users.create({
      data: {
        email: validatedData.email,
        password_hash: validatedData.password_hash,
        display_name: validatedData.display_name,
        race: validatedData.race,
        class: validatedData.class_name,
        locale: validatedData.locale,
        currentEraId: activeEra.id,
        colorScheme: resolveColorScheme(null, validatedData.race),
        ...buildDefaultUserUpdate(buildEraStartOverrides(startSettings)),
      },
    });

    await tx.users.update({
      where: { id: user.id },
      data: { recruit_link: md5(user.id.toString()) },
    });

    await resetUserRelations(tx, user.id, startSettings);

    return sanitizeUserForResponse(user);
  });
};

export const userExists = async (email: string, displayName?: string) => {
  return await prisma.users.count({
    where: {
      OR: [
        {
          // Case-insensitive: the unique constraint itself is case-sensitive.
          email: { equals: email.toLowerCase(), mode: 'insensitive' },
        },
        {
          display_name: {
            equals: displayName ?? email,
            mode: 'insensitive',
          },
        },
      ],
    },
  });
};

/** Update user and bank history. */
export const updateUserAndBankHistory = async (
  prismaInstance: Prisma.TransactionClient,
  userId: number,
  userGold: bigint,
  updatedData: any[],
  killingStrength: number,
  defenseStrength: number,
  newOffense: number,
  newDefense: number,
  newSpying: number,
  newSentry: number,
  bankData: any,
  updateType: 'units' | 'items' | 'battle_upgrades',
  newStamina?: number,
  newMaxStamina?: number,
) => {
  const updateData: any = {
    gold: userGold,
    offense: newOffense,
    defense: newDefense,
    spy: newSpying,
    sentry: newSentry,
  };

  if (newStamina !== undefined) {
    updateData.stamina = newStamina;
  }

  if (newMaxStamina !== undefined) {
    updateData.maxStamina = newMaxStamina;
  }

  // Update user stats
  await prismaInstance.users.update({
    where: { id: userId },
    data: updateData,
  });

  // Handle units update using UserUnit table
  if (updateType === 'units') {
    // Always delete existing UserUnit records for this user to ensure empty arrays clear DB state
    await prismaInstance.userUnit.deleteMany({
      where: { userId },
    });

    // Create new UserUnit records from updatedData if any
    if (updatedData && updatedData.length > 0) {
      for (const unit of updatedData) {
        // Contract troops are roster projections owned by ForceContract, not
        // permanent UserUnit rows. Keep them in stat calculations only.
        if (unit.forceContractId) continue;
        if (unit.type && unit.level && unit.quantity !== undefined) {
          await prismaInstance.userUnit.create({
            data: {
              userId,
              type: unit.type,
              level: unit.level,
              quantity: unit.quantity,
              isMercenary: unit.isMercenary || false,
            },
          });
        }
      }
    }
  }

  // Handle items update using UserItem table
  if (updateType === 'items') {
    // Always delete existing UserItem records for this user to correctly handle empty updatedData arrays
    await prismaInstance.userItem.deleteMany({
      where: { userId },
    });

    // Create new UserItem records from updatedData if any
    if (updatedData && updatedData.length > 0) {
      for (const item of updatedData) {
        if (
          item.type &&
          item.level &&
          item.usage &&
          item.quantity !== undefined
        ) {
          await prismaInstance.userItem.create({
            data: {
              userId,
              type: item.type,
              level: item.level,
              usage: item.usage,
              quantity: item.quantity,
            },
          });
        }
      }
    }
  }

  // Handle battle_upgrades update using UserBattleUpgrade table
  if (updateType === 'battle_upgrades') {
    // Always delete existing UserBattleUpgrade records for this user to ensure empty arrays clear DB state
    await prismaInstance.userBattleUpgrade.deleteMany({
      where: { userId },
    });

    // Create new UserBattleUpgrade records from updatedData if any
    if (updatedData && updatedData.length > 0) {
      for (const upgrade of updatedData) {
        if (upgrade.type && upgrade.level && upgrade.quantity !== undefined) {
          await prismaInstance.userBattleUpgrade.create({
            data: {
              userId,
              type: upgrade.type,
              level: upgrade.level,
              quantity: upgrade.quantity,
            },
          });
        }
      }
    }
  }

  // We could probably add this to bank.service instead and call it.
  await prismaInstance.bank_history.create({
    data: bankData,
  });
};

export type LoginBlockingStatus =
  | 'CLOSED'
  | 'BANNED'
  | 'SUSPENDED'
  | 'VACATION';

export interface ActiveAccountStatus {
  status: LoginBlockingStatus;
  endDate: Date | null;
}

/**
 * Raw read behind getLoginBlockingStatus: returns the latest in-effect status
 * row together with its end date, or null. Accepts a transaction client so
 * callers holding the users row lock can read consistently inside their
 * transaction. Never writes history and never rewrites CLOSED to INACTIVE.
 */
export const getActiveAccountStatus = async (
  userId: number,
  client: Pick<Prisma.TransactionClient, 'accountStatusHistory'> = prisma,
): Promise<ActiveAccountStatus | null> => {
  const now = new Date();
  const record = await client.accountStatusHistory.findFirst({
    where: {
      user_id: userId,
      start_date: { lte: now },
    },
    orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
    select: { status: true, end_date: true },
  });

  return resolveActiveAccountStatus(record, now);
};

/** Shared single/bulk status interpretation: latest expired rows do not revive older sanctions. */
function resolveActiveAccountStatus(
  record: { status: string; end_date: Date | null } | null,
  now: Date,
): ActiveAccountStatus | null {
  if (!record || (record.end_date && record.end_date <= now)) return null;

  switch (record.status) {
    case 'CLOSED':
    case 'BANNED':
    case 'SUSPENDED':
    case 'VACATION':
      return { status: record.status, endDate: record.end_date };
    default:
      return null;
  }
}

export async function getLoginBlockingStatuses(
  userIds: number[],
): Promise<Map<number, LoginBlockingStatus | null>> {
  const now = new Date();
  const records = await prisma.accountStatusHistory.findMany({
    where: { user_id: { in: userIds }, start_date: { lte: now } },
    orderBy: [{ user_id: 'asc' }, { start_date: 'desc' }, { id: 'desc' }],
    distinct: ['user_id'],
    select: { user_id: true, status: true, end_date: true },
  });
  return new Map(
    records.map((record) => [
      record.user_id,
      resolveActiveAccountStatus(record, now)?.status ?? null,
    ]),
  );
}

/**
 * Access-decision read of the stored status. Unlike getUpdatedStatus it never
 * writes history, and it does not rewrite CLOSED to INACTIVE for stale
 * last_active. Returns a blocking status only while its row is in effect.
 */
export const getLoginBlockingStatus = async (
  userId: number,
): Promise<LoginBlockingStatus | null> => {
  const active = await getActiveAccountStatus(userId);
  return active?.status ?? null;
};

/** Returns updated status for callers that need normalized game data. */
export const getUpdatedStatus = async (userId: number) => {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const now = new Date();

    // Fetch the latest status history record for the user
    const statusHistory = await tx.accountStatusHistory.findFirst({
      where: {
        user_id: userId,
        start_date: {
          lte: now,
        },
      },
      orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
    });

    // If no status history exists, treat as INACTIVE so login resets to defaults
    if (!statusHistory) {
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'INACTIVE',
          start_date: now,
          reason: 'No status history found, defaulting to INACTIVE',
        },
      });
      return 'INACTIVE';
    }

    // Check if the current status has expired
    if (statusHistory.end_date && statusHistory.end_date <= now) {
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'ACTIVE',
          start_date: now,
          reason: 'Status expired, reverting to ACTIVE',
        },
      });
      return 'ACTIVE';
    }

    // Check if user should transition from IDLE to ACTIVE
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { last_active: true },
    });

    if (statusHistory.status === 'INACTIVE') {
      return 'INACTIVE';
    }

    // Administrative blocks are never rewritten by the idle transition. Without
    // this, a closed or banned account with a stale last_active gets an INACTIVE
    // row and regains login (ADM-02, BAN-bypass).
    if (
      statusHistory.status === 'CLOSED' ||
      statusHistory.status === 'BANNED' ||
      statusHistory.status === 'SUSPENDED' ||
      statusHistory.status === 'VACATION'
    ) {
      return statusHistory.status;
    }

    const inactiveThreshold = idleThresholdDate(365);
    if (!user?.last_active || user.last_active < inactiveThreshold) {
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'INACTIVE',
          start_date: now,
          reason: 'User has been idle for over 365 days',
        },
      });
      return 'INACTIVE';
    }

    if (
      statusHistory.status === 'IDLE' &&
      user?.last_active &&
      user.last_active >= idleThresholdDate(60)
    ) {
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'ACTIVE',
          start_date: now,
          reason: 'User activity detected, transitioning to ACTIVE',
        },
      });
      return 'ACTIVE';
    }

    // Check if user should transition to IDLE
    if (
      statusHistory.status !== 'IDLE' &&
      (!user?.last_active || user.last_active < idleThresholdDate(60))
    ) {
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'IDLE',
          start_date: now,
          reason: 'User has been idle for over 60 days',
        },
      });
      return 'IDLE';
    }

    // Return the current status
    return statusHistory.status;
  });
};
