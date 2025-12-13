// src/services/sessions.service.ts
import prisma from '@/lib/prisma';

export const endSession = async (uID, sessionId) => {
  await prisma.autoRecruitSession.deleteMany({
    where: { id: sessionId, userId: uID },
  });
}

export const getSession = async (uID, sessionId) => {
  return await prisma.autoRecruitSession.findUnique({
    where: { id: sessionId, userId: uID },
  });
}

export const countSessions = async (uID) => {
  return await prisma.autoRecruitSession.count({
    where: { userId: uID },
  });
}

export const validateSession = async (uID, sessionId) => {
  const activeSessions = await prisma.autoRecruitSession.count({
    where: { userId: uID, id: sessionId },
  });

  return activeSessions > 0;
}

export const createSession = async (uID) => {
  return await prisma.autoRecruitSession.create({
    data: {
      userId: uID,
    },
  });
}

export const expireOldSessions = async (uID) => {
  const expirationTime = new Date(Date.now() - 5 * 60 * 1000);
  await prisma.autoRecruitSession.deleteMany({
    where: {
      userId: uID,
      lastActivityAt: { lt: expirationTime },
    },
  });
}

export const updateSessionActivity = async (uID, sessionId) => {
  await prisma.autoRecruitSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });
}

export const listSessions = async (uID) => {
  return await prisma.autoRecruitSession.findMany({
    where: { userId: uID },
    select: {
      id: true,
      createdAt: true,
      lastActivityAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}