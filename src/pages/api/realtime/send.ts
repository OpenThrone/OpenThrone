import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { rateLimiter } from '@/lib/rate-limiter';
import {
  isAuthorizedTaskRequest,
  isRecord,
  serializeRealtimePayload,
} from '@/lib/realtimeInternal';
import { isSessionAccountStatusAllowed } from '@/lib/sessionAccount';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  type MessageData,
  MessagingService,
  serializeChatMessage,
} from '@/services/Messaging.service';
import type { AuthenticatedRequest } from '@/types/api';
import { logError } from '@/utils/logger';

/**
 * POST /api/realtime/send — internal write path of the Durable Objects
 * realtime pilot (#23). The ChatRoomDO calls it over the
 * WORKER_SELF_REFERENCE service binding with the raw TASK_SECRET
 * Authorization header (the cron endpoints' contract); it authorizes exactly
 * one message and returns everything the DO needs for fanout.
 *
 * Guarantees kept identical to the Socket.IO write path
 * (`src/lib/socket.ts:310-397`):
 * - persistence + all authorization via the EXISTING
 *   `MessagingService.sendMessageRealtime` (participant, canWrite, alliance
 *   membership, reply/log-share validation — Postgres stays the source of
 *   truth);
 * - the per-user Postgres rate limit 10 sends / 10 s;
 * - a per-packet account-status check standing in for the Socket.IO account
 *   guard (`src/lib/socket.ts:36-57`).
 */

const SendSchema = z.object({
  userId: z.number().int().positive(),
  roomId: z.number().int().positive(),
  content: z.string().min(1),
  // Shape and size are validated by MessagingService's SendMessageSchema.
  richContent: z.unknown().optional(),
  clientMessageId: z.string().uuid().optional(),
  tempId: z.number().optional(),
  replyToMessageId: z.number().int().positive().optional(),
  messageType: z.string().optional(),
  sharedAttackLogId: z.number().int().positive().optional(),
});

const guardedHandler = withApiGuard({ methods: ['POST'], authMode: 'none' });

const sendRealtime = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (!isAuthorizedTaskRequest(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized or Disabled Task' });
  }

  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid message data' });
  }
  const { userId, tempId, roomId, content } = parsed.data;
  const messageData = {
    roomId,
    content,
    // Validated by sendMessageRealtime's SendMessageSchema, like Socket.IO.
    richContent: parsed.data.richContent as MessageData['richContent'],
    clientMessageId: parsed.data.clientMessageId,
    replyToMessageId: parsed.data.replyToMessageId,
    messageType: parsed.data.messageType,
    sharedAttackLogId: parsed.data.sharedAttackLogId,
  };

  // Account-status guard parity: a banned/suspended/vacation account must not
  // act over the DO path either.
  if (!(await isSessionAccountStatusAllowed(userId))) {
    return res.status(401).json({ error: 'Invalid session account' });
  }

  if (
    !(await rateLimiter(`sendMessage-${userId}`, { windowMs: 10000, max: 10 }))
  ) {
    return res
      .status(429)
      .json({ error: 'You are sending messages too quickly.' });
  }

  try {
    const newMessage = await MessagingService.sendMessageRealtime(
      userId,
      messageData,
    );

    // Same client shape the Socket.IO path acknowledges with.
    const serializedMessage = serializeRealtimePayload(
      serializeChatMessage(newMessage),
    );
    if (!isRecord(serializedMessage)) {
      throw new Error('Unable to serialize message payload');
    }

    // All current participants: the DO's lazy-eviction membership check. The
    // notification fanout (every participant except the sender) mirrors
    // `sendNotifications` (`src/lib/socket.ts:890-920`).
    const participants = await prisma.chatRoomParticipant.findMany({
      where: { roomId: messageData.roomId },
      select: { userId: true },
    });
    const participantUserIds = participants.map(
      (participant) => participant.userId,
    );

    const notification = {
      id: newMessage.id,
      senderId: userId,
      senderName: newMessage.sender.display_name,
      content:
        newMessage.content.substring(0, 50) +
        (newMessage.content.length > 50 ? '...' : ''),
      timestamp: newMessage.sentAt.toISOString(),
      isRead: false as const,
      chatRoomId: messageData.roomId,
    };

    // A deduplicated retry was already fanned out and notified by the
    // original send; the DO only re-acknowledges it to the sender.
    return res.status(200).json({
      message: serializedMessage,
      tempId,
      deduplicated: Boolean(newMessage.deduplicated),
      participantUserIds,
      notification: newMessage.deduplicated ? null : notification,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid message data' });
    }
    const message = error instanceof Error ? error.message : String(error);
    logError('Error sending DO realtime message', {
      userId,
      roomId: messageData.roomId,
      error,
    });
    // Authorization/validation failures from the service are user-facing.
    return res
      .status(403)
      .json({ error: message || 'Failed to send message.' });
  }
};

export default guardedHandler(sendRealtime);
