import md5 from 'md5';

import prisma from '@/lib/prisma';
import { emitToUser } from '@/lib/realtime';
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
export const emitSocialCountUpdate = async (userId: number) => {
  try {
    const counts = await SocialService.getNotificationCounts(userId);
    await emitToUser(userId, 'socialCountUpdate', {
      count: counts.totalCount,
    });
  } catch (error) {
    logError('Error emitting social count update:', error);
  }
};

/** Emit gold request count update. */
export const emitGoldRequestCountUpdate = async (userId: number) => {
  try {
    const result = await SocialService.countPendingGoldRequests(userId);
    await emitToUser(userId, 'goldRequestCountUpdate', {
      count: result.count || 0,
    });
  } catch (error) {
    logError('Error emitting gold request count update:', error);
  }
};

/** Emit friend request notification. */
export const emitFriendRequestNotification = async ({
  senderId,
  recipientId,
}: {
  senderId: number;
  recipientId: number;
}) => {
  try {
    const senderName = await resolveSenderName(senderId);
    const message = `You have received a friend request from ${senderName}`;
    const hash = md5(message + recipientId);
    await emitToUser(recipientId, 'friendRequestNotification', {
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
export const emitGoldRequestNotification = async ({
  senderId,
  recipientId,
}: {
  senderId: number;
  recipientId: number;
}) => {
  try {
    const senderName = await resolveSenderName(senderId);
    const message = `You have received a gold request from ${senderName}`;
    const hash = md5(message + recipientId);
    await emitToUser(recipientId, 'goldRequestNotification', {
      message,
      hash,
      senderId,
      senderName,
    });
  } catch (error) {
    logError('Error emitting gold request notification:', error);
  }
};
