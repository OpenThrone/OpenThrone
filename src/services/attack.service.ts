import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import mtRand from '@/utils/mtrand';

export const getUserById = async (userId) => {
  return await prisma.users.findUnique({
    where: { id: userId },
  });
};

export const updateUserUnits = async (userId, units) => {
  await prisma.users.update({
    where: { id: userId },
    data: { units },
  });
};

export const createAttackLog = async (logData) => {
  return await prisma.attack_log.create({
    data: logData,
  });
};

export const updateUser = async (userId, data) => {
  await prisma.users.update({
    where: { id: userId },
    data,
  });
};

export const createBankHistory = async (historyData) => {
  await prisma.bank_history.create({
    data: historyData,
  });
};