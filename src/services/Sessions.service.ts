// src/services/sessions.service.ts
import { z } from 'zod';

import prisma from '@/lib/prisma';

const SessionSchema = z.object({
  uID: z.number().int().positive(),
  sessionId: z.number().int().positive(),
});

const UserSchema = z.object({
  uID: z.number().int().positive(),
});

/** End session. */
export const endSession = async (uID, sessionId) => {
  const validatedData = SessionSchema.parse({ uID, sessionId });
  await prisma.autoRecruitSession.deleteMany({
    where: { id: validatedData.sessionId, userId: validatedData.uID },
  });
};

/** Returns session for callers that need normalized game data. */
export const getSession = async (uID, sessionId) => {
  const validatedData = SessionSchema.parse({ uID, sessionId });
  return await prisma.autoRecruitSession.findUnique({
    where: { id: validatedData.sessionId, userId: validatedData.uID },
  });
};

const countSessions = async (uID) => {
  const validatedData = UserSchema.parse({ uID });
  return await prisma.autoRecruitSession.count({
    where: { userId: validatedData.uID },
  });
};

/** Validate session. */
export const validateSession = async (uID, sessionId) => {
  const validatedData = SessionSchema.parse({ uID, sessionId });
  const activeSessions = await prisma.autoRecruitSession.count({
    where: { userId: validatedData.uID, id: validatedData.sessionId },
  });

  return activeSessions > 0;
};

const createSession = async (uID) => {
  const validatedData = UserSchema.parse({ uID });
  return await prisma.autoRecruitSession.create({
    data: {
      userId: validatedData.uID,
    },
  });
};

const expireOldSessions = async (uID) => {
  const validatedData = UserSchema.parse({ uID });
  const expirationTime = new Date(Date.now() - 5 * 60 * 1000);
  await prisma.autoRecruitSession.deleteMany({
    where: {
      userId: validatedData.uID,
      lastActivityAt: { lt: expirationTime },
    },
  });
};

/** Update session activity. */
export const updateSessionActivity = async (uID, sessionId) => {
  const validatedData = SessionSchema.parse({ uID, sessionId });
  await prisma.autoRecruitSession.update({
    where: { id: validatedData.sessionId, userId: validatedData.uID },
    data: { lastActivityAt: new Date() },
  });
};

/** List sessions. */
export const listSessions = async (uID) => {
  const validatedData = UserSchema.parse({ uID });
  return await prisma.autoRecruitSession.findMany({
    where: { userId: validatedData.uID },
    select: {
      id: true,
      createdAt: true,
      lastActivityAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};
