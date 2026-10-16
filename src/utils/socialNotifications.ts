import md5 from 'md5';
import type { Server } from 'socket.io';

import prisma from '@/lib/prisma';
import { SocialService } from '@/services/Social.service';
import { logError } from '@/utils/logger';

const resolveSenderName = async (senderId: number) => {
  const sender = await prisma.users.findUnique({
    where: { id: senderId },
    select: { display_name: true },
  });
  return sender?.display_name || 'someone';
};

/** Emit social count update. */
export const emitSocialCountUpdate = async (
  io: Server | null,
  userId: number,
) => {
  if (!io) return;
  try {
    const counts = await SocialService.getNotificationCounts(userId);
    io.to(`user-${userId}`).emit('socialCountUpdate', {
      count: counts.totalCount,
    });
  } catch (error) {
    logError('Error emitting social count update:', error);
  }
};

/** Emit gold request count update. */
export const emitGoldRequestCountUpdate = async (
  io: Server | null,
  userId: number,
) => {
  if (!io) return;
  try {
    const result = await SocialService.countPendingGoldRequests(userId);
    io.to(`user-${userId}`).emit('goldRequestCountUpdate', {
      count: result.count || 0,
    });
  } catch (error) {
    logError('Error emitting gold request count update:', error);
  }
};

/** Emit friend request notification. */
export const emitFriendRequestNotification = async (
  io: Server | null,
  {
    senderId,
    recipientId,
  }: {
    senderId: number;
    recipientId: number;
  },
) => {
  if (!io) return;
  try {
    const senderName = await resolveSenderName(senderId);
    const message = `You have received a friend request from ${senderName}`;
    const hash = md5(message + recipientId);
    io.to(`user-${recipientId}`).emit('friendRequestNotification', {
      message,
      hash,
      senderId,
      senderName,
    });
  } catch (error) {
    logError('Error emitting friend request notification:', error);
  }
};

/** Emit gold request notification. */
export const emitGoldRequestNotification = async (
  io: Server | null,
  {
    senderId,
    recipientId,
  }: {
    senderId: number;
    recipientId: number;
  },
) => {
  if (!io) return;
  try {
    const senderName = await resolveSenderName(senderId);
    const message = `You have received a gold request from ${senderName}`;
    const hash = md5(message + recipientId);
    io.to(`user-${recipientId}`).emit('goldRequestNotification', {
      message,
      hash,
      senderId,
      senderName,
    });
  } catch (error) {
    logError('Error emitting gold request notification:', error);
  }
};
