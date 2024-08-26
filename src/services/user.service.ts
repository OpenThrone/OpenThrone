import md5 from "md5";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const createUser = async (email: string, password_hash: string, display_name: string, race: string, class_name: string, locale: string = 'en-US') => {
  return await prisma.$transaction(async (prisma) => {
    const user = await prisma.users.create({
      data: {
        email,
        password_hash,
        display_name,
        race,
        class: class_name,
        locale,
      },
    });

    await prisma.users.update({
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
  updateType: 'units' | 'items'
) => {
  const updateData: any = {
    gold: userGold,
    killing_str: killingStrength,
    defense_str: defenseStrength,
    offense: newOffense,
    defense: newDefense,
    spy: newSpying,
    sentry: newSentry,
  };

  if (updateType === 'units') {
    updateData.units = updatedData;
  } else if (updateType === 'items') {
    updateData.items = updatedData;
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
