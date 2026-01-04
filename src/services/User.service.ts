import md5 from "md5";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from 'zod';
import { idleThresholdDate } from "@/utils/utilities";
import {
  ensureActiveEra,
} from "./Era.service";
import {
  buildDefaultUserUpdate,
  ERA_DEFAULT_BATTLE_UPGRADES,
  ERA_DEFAULT_BONUS_POINTS,
  ERA_DEFAULT_ITEMS,
  ERA_DEFAULT_STRUCTURE_UPGRADES,
  ERA_DEFAULT_UNITS,
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

const UpdateLastActiveSchema = z.object({
  email: z.string().email().optional(),
  userId: z.number().int().positive().optional(),
  displayName: z.string().optional(),
}).refine(data => data.email || data.userId || data.displayName, {
  message: "At least one identifier (email, userId, or displayName) must be provided",
});

export const createUser = async (email: string, password_hash: string, display_name: string, race: string, class_name: string, locale: string = 'en-US') => {
  const validatedData = CreateUserSchema.parse({ email, password_hash, display_name, race, class_name, locale });
  return await prisma.$transaction(async (tx) => {
    const activeEra = await ensureActiveEra(tx);

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
        ...buildDefaultUserUpdate(),
      },
    });

    await tx.users.update({
      where: { id: user.id },
      data: { recruit_link: md5(user.id.toString()) },
    });

    await tx.userUnit.createMany({
      data: ERA_DEFAULT_UNITS.map(unit => ({ ...unit, userId: user.id })),
    });

    await tx.userItem.createMany({
      data: ERA_DEFAULT_ITEMS.map(item => ({ ...item, userId: user.id })),
    });

    await tx.userStructureUpgrade.createMany({
      data: ERA_DEFAULT_STRUCTURE_UPGRADES.map(upgrade => ({ ...upgrade, userId: user.id })),
    });

    await tx.userBattleUpgrade.createMany({
      data: ERA_DEFAULT_BATTLE_UPGRADES.map(upgrade => ({ ...upgrade, userId: user.id })),
    });

    await tx.userBonusPoints.createMany({
      data: ERA_DEFAULT_BONUS_POINTS.map(bonus => ({ ...bonus, userId: user.id })),
    });

    return user;
  });
}

export const userExists = async (email: string) => {
  return await prisma.users.count({
    where: {
      OR: [
        {
          email: email.toLowerCase()
          
        },
        {
          display_name: {
            equals: email,
            mode: 'insensitive'
          }
          
        }
      ]      
    },
  });
}

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
  newMaxStamina?: number
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
      where: { userId: userId }
    });

    // Create new UserUnit records from updatedData if any
    if (updatedData && updatedData.length > 0) {
      for (const unit of updatedData) {
        if (unit.type && unit.level && unit.quantity !== undefined) {
          await prismaInstance.userUnit.create({
            data: {
              userId: userId,
              type: unit.type,
              level: unit.level,
              quantity: unit.quantity,
              isMercenary: unit.isMercenary || false
            }
          });
        }
      }
    }
  }

  // Handle items update using UserItem table
  if (updateType === 'items') {
    // Always delete existing UserItem records for this user to correctly handle empty updatedData arrays
    await prismaInstance.userItem.deleteMany({
      where: { userId: userId }
    });

    // Create new UserItem records from updatedData if any
    if (updatedData && updatedData.length > 0) {
      for (const item of updatedData) {
        if (item.type && item.level && item.usage && item.quantity !== undefined) {
          await prismaInstance.userItem.create({
            data: {
              userId: userId,
              type: item.type,
              level: item.level,
              usage: item.usage,
              quantity: item.quantity
            }
          });
        }
      }
    }
  }

  // Handle battle_upgrades update using UserBattleUpgrade table
  if (updateType === 'battle_upgrades') {
    // Always delete existing UserBattleUpgrade records for this user to ensure empty arrays clear DB state
    await prismaInstance.userBattleUpgrade.deleteMany({
      where: { userId: userId }
    });

    // Create new UserBattleUpgrade records from updatedData if any
    if (updatedData && updatedData.length > 0) {
      for (const upgrade of updatedData) {
        if (upgrade.type && upgrade.level && upgrade.quantity !== undefined) {
          await prismaInstance.userBattleUpgrade.create({
            data: {
              userId: userId,
              type: upgrade.type,
              level: upgrade.level,
              quantity: upgrade.quantity
            }
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

export const getUpdatedStatus = async (userId: number) => {
  const now = new Date();

  // Fetch the latest status history record for the user
  let statusHistory = await prisma.accountStatusHistory.findFirst({
    where: {
      user_id: userId,
      start_date: {
        lte: now,
      },
    },
    orderBy: {
      start_date: 'desc',
    },
  });

  // If no status history exists, treat as INACTIVE so login resets to defaults
  if (!statusHistory) {
    await prisma.accountStatusHistory.create({
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
    await prisma.accountStatusHistory.create({
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
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { last_active: true },
  });

  if (statusHistory.status === 'INACTIVE') {
    return 'INACTIVE';
  }

  const inactiveThreshold = idleThresholdDate(365);
  if (!user?.last_active || user.last_active < inactiveThreshold) {
    await prisma.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: 'INACTIVE',
        start_date: now,
        reason: 'User has been idle for over 365 days',
      },
    });
    return 'INACTIVE';
  }

  if (statusHistory.status === 'IDLE' && user?.last_active && user.last_active >= idleThresholdDate(60)) {
    await prisma.accountStatusHistory.create({
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
  if (statusHistory.status !== 'IDLE' && (!user?.last_active || user.last_active < idleThresholdDate(60))) {
    await prisma.accountStatusHistory.create({
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
};

export const updateLastActive = async ({ email, userId, displayName }: { email?: string; userId?: number; displayName?: string }) => {
  const validatedData = UpdateLastActiveSchema.parse({ email, userId, displayName });

  return prisma.users.update({
    where: validatedData.email ? { email: validatedData.email } : validatedData.userId ? { id: validatedData.userId } : { display_name: validatedData.displayName },
    data: { last_active: new Date() },
  });
};
