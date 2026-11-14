import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import {
  isAuthorizedTaskRequest,
  serializeRealtimePayload,
} from '@/lib/realtimeInternal';
import { withApiGuard } from '@/middleware/apiGuard';
import { MessagingService } from '@/services/Messaging.service';
import type { AuthenticatedRequest } from '@/types/api';
import { safeToISOString } from '@/utils/dateHelpers';
import { logError } from '@/utils/logger';

/**
 * POST /api/realtime/read — internal read-receipt path of the Durable Objects
 * realtime pilot (#23). The ChatRoomDO calls it over the
 * WORKER_SELF_REFERENCE service binding with the raw TASK_SECRET header.
 *
 * Parity with the Socket.IO `markAsRead` handler (`src/lib/socket.ts:666-722`):
 * the caller must be a room participant, ids are capped at 100 and
 * room-scoped by `MessagingService.markMessagesAsRead`, and the response
 * carries the receipt updates the DO broadcasts as `messagesRead` plus the
 * participant list for its lazy-eviction check.
 */

const ReadSchema = z.object({
  userId: z.number().int().positive(),
  roomId: z.number().int().positive(),
  messageIds: z.array(z.number().int().positive()).min(1).max(100),
});

const guardedHandler = withApiGuard({ methods: ['POST'], authMode: 'none' });

const markRealtimeRead = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  if (!isAuthorizedTaskRequest(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized or Disabled Task' });
  }

  const parsed = ReadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid read receipt data' });
  }
  const { userId, roomId, messageIds } = parsed.data;

  try {
    const participant = await prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { userId: true },
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this room.' });
    }

    const { receipts } = await MessagingService.markMessagesAsRead(
      userId,
      {
        messageIds,
      },
      roomId,
    );

    const updates = receipts.map((receipt) => ({
      messageId: receipt.messageId,
      userId: receipt.userId,
      readAt: safeToISOString(receipt.readAt),
    }));

    const participants = await prisma.chatRoomParticipant.findMany({
      where: { roomId },
      select: { userId: true },
    });

    return res.status(200).json({
      roomId,
      updates: serializeRealtimePayload(updates),
      participantUserIds: participants.map((entry) => entry.userId),
    });
  } catch (error: unknown) {
    // Parity: the socket handler only logs markAsRead failures.
    logError('Error marking DO realtime messages read', {
      userId,
      roomId,
      error,
    });
    return res.status(403).json({ error: 'Failed to mark messages as read.' });
  }
};

export default guardedHandler(markRealtimeRead);
