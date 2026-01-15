import type { NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth'; // Import Session type
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { MessagingService } from '@/services/Messaging.service';
import { logDebug, logError, logInfo } from '@/utils/logger';

// Define a custom request type that includes the session injected by withAuth
interface AuthenticatedRequest extends NextApiRequest {
  session: Session;
}

const CreateRoomSchema = z.object({
  name: z.string().optional(),
  recipients: z.array(z.number().int()),
  message: z.string().optional(),
  isPrivate: z.boolean().optional().default(true),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Use AuthenticatedRequest
  const userId = Number(req.session.user.id); // Access session correctly

  if (req.method === 'GET') {
    try {
      const rooms = await MessagingService.getUserChatRooms(userId);
      logInfo('Fetched rooms for user:', userId);
      logInfo('Returning formatted rooms for user:', userId);
      logDebug('Formatted rooms:', rooms);
      return res.json(rooms);
    } catch (error) {
      logError('Error getting user chat rooms', { userId, error });
      return res.status(500).json({ message: 'Failed to fetch chat rooms' });
    }
  }

  if (req.method === 'POST') {
    const validatedBody = CreateRoomSchema.safeParse(req.body);
    if (!validatedBody.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        details: validatedBody.error.flatten().fieldErrors,
      });
    }

    const { name, recipients, message, isPrivate } = validatedBody.data;

    try {
      const result = await MessagingService.createOrFindRoom(userId, {
        name,
        recipients,
        message,
        isPrivate,
      });

      if (message?.trim()) {
        const io = getSocketIO();
        if (io) {
          const [latestMessage, participants] = await Promise.all([
            prisma.chatMessage.findFirst({
              where: { roomId: result.id },
              orderBy: { sentAt: 'desc' },
              select: {
                id: true,
                sentAt: true,
                content: true,
                sender: { select: { id: true, display_name: true } },
              },
            }),
            prisma.chatRoomParticipant.findMany({
              where: { roomId: result.id, userId: { not: userId } },
              select: { userId: true },
            }),
          ]);

          if (latestMessage) {
            const notificationPayload = {
              id: latestMessage.id,
              senderId: latestMessage.sender.id,
              senderName: latestMessage.sender.display_name,
              content:
                latestMessage.content.substring(0, 50) +
                (latestMessage.content.length > 50 ? '...' : ''),
              timestamp: latestMessage.sentAt.toISOString(),
              isRead: false,
              chatRoomId: result.id,
            };

            participants.forEach((p) => {
              io.to(`user-${p.userId}`).emit(
                'newMessageNotification',
                notificationPayload,
              );
            });
          }
        }
      }

      return res.status(result.isExisting ? 200 : 201).json(result);
    } catch (error) {
      logError('Error creating or finding chat room', {
        userId,
        data: req.body,
        error,
      });
      if (
        error.message.includes('Conflict') ||
        error.message.includes('could not create')
      ) {
        return res.status(409).json({ message: error.message });
      }
      return res.status(500).json({ message: 'Failed to create conversation' });
    }
  }

  res.status(405).end();
}

export default withAuth(handler);
