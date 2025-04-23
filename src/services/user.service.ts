import md5 from "md5";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { idleThresholdDate } from "@/utils/utilities";

export const createUser = async (email: string, password_hash: string, display_name: string, race: string, class_name: string, locale: string = 'en-US') => {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        email,
        password_hash,
        display_name,
        race,
        class: class_name,
        locale,
      },
    });

    await tx.users.update({
      where: { id: user.id },
      data: { recruit_link: md5(user.id.toString()) },
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
  updateType: 'units' | 'items' | 'battle_upgrades'
) => {
  const updateData: any = {
    gold: userGold,
    offense: newOffense,
    defense: newDefense,
    spy: newSpying,
    sentry: newSentry,
  };

  if (updateType === 'units') {
    updateData.units = updatedData;
  } else if (updateType === 'items') {
    updateData.items = updatedData;
  } else if (updateType === 'battle_upgrades') {
    updateData.battle_upgrades = updatedData;
  }

  await prismaInstance.users.update({
    where: { id: userId },
    data: updateData,
  });

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

  // If no status history exists, default to ACTIVE
  if (!statusHistory) {
    await prisma.accountStatusHistory.create({
      data: {
        user_id: userId,
        status: 'ACTIVE',
        start_date: now,
      },
    });
    return 'ACTIVE';
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
  if (!email && !userId && !displayName) {
    throw new Error('At least one identifier (email, userId, or displayName) must be provided');
  }

  if (email && typeof email !== 'string') {
    throw new Error('Email must be a string');
  }
  if (userId && typeof userId !== 'number') {
    throw new Error('UserId must be a number');
  }
  if (displayName && typeof displayName !== 'string') {
    throw new Error('DisplayName must be a string');
  }

  return prisma.users.update({
    where: email ? { email } : userId ? { id: userId } : { display_name: displayName },
    data: { last_active: new Date() },
  });
};