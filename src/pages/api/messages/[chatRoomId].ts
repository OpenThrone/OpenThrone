import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket'; // Import socket instance getter
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chatRoomId } = req.query;
  const session = req.session; // Auth handled by middleware

  if (!session) {
    // This should ideally not happen if withAuth is working correctly
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = Number(session.user.id);
  const roomId = Number(chatRoomId);

  // Fetch Room and verify participation (as before)
  const roomParticipant = await prisma.chatRoomParticipant.findUnique({
    where: { roomId_userId: { roomId: roomId, userId: userId } },
    include: {
      room: {
        include: {
          participants: {
            select: { userId: true } // Needed for broadcasting
          }
        }
      }
    }
  });

  if (!roomParticipant) {
    return res.status(403).json({ message: 'Forbidden: You are not a participant in this room.' });
  }

  // --- GET Request (Fetching Messages) ---
  if (req.method === 'GET') {
    try {
      // ... (GET logic remains largely the same, ensure dates are serialized) ...
      const messages = await prisma.chatMessage.findMany({
        where: { roomId: roomId },
        orderBy: { sentAt: 'asc' },
        include: {
          sender: {
            select: { id: true, display_name: true, avatar: true, last_active: true },
          },
        }
      });

      const transformedMessages = messages.map(message => {
        const isOnline = message.sender.last_active ?
          (new Date().getTime() - new Date(message.sender.last_active).getTime()) < 5 * 60 * 1000
          : false;

        return {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          content: message.content,
          sentAt: message.sentAt.toISOString(), // Serialize Date
          sender: {
            id: message.sender.id,
            display_name: message.sender.display_name,
            avatar: message.sender.avatar,
            is_online: isOnline
          }
        };
      });
      res.status(200).json(transformedMessages);

    } catch (error) {
      logError("GET /api/messages/[chatRoomId] Error:", error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  }
  // --- POST Request (Sending Message) ---
  else if (req.method === 'POST') {
    // Check write permissions
    if (!roomParticipant.canWrite) {
      return res.status(403).json({ message: 'Forbidden: You do not have permission to write in this room.' });
    }

    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: 'Message content cannot be empty.' });
      }

      // 1. Save the message
      const newMessage = await prisma.chatMessage.create({
        data: {
          roomId: roomId,
          senderId: userId,
          content: content.trim(), // Trim content
        },
        include: {
          sender: { // Include sender for broadcast payload
            select: { id: true, display_name: true, avatar: true, last_active: true },
          },
        },
      });

      // Update room's updatedAt timestamp
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: new Date() },
      });


      // 2. Get Socket.IO instance and broadcast
      const io = getSocketIO();
      if (io) {
        // Prepare payloads
        const messagePayload = {
          ...newMessage,
          sentAt: newMessage.sentAt.toISOString(), // Serialize Date
          sender: {
            ...newMessage.sender,
            last_active: newMessage.sender.last_active?.toISOString(), // Serialize date
            is_online: newMessage.sender.last_active ? (new Date().getTime() - new Date(newMessage.sender.last_active).getTime()) < 5 * 60 * 1000 : false
          }
        };

        const notificationPayload = {
          id: newMessage.id,
          senderId: userId,
          senderName: newMessage.sender.display_name,
          content: content.substring(0, 50) + (content.length > 50 ? '...' : ''), // Snippet
          timestamp: newMessage.sentAt.toISOString(),
          isRead: false,
          chatRoomId: roomId,
        };


        // Emit 'receiveMessage' to the specific chat room channel
        io.to(`room-${roomId}`).emit('receiveMessage', messagePayload);
        console.log(`API emitted 'receiveMessage' to room-${roomId}`);

        // Emit 'newMessageNotification' to each participant's user channel (excluding sender)
        roomParticipant.room.participants.forEach(p => {
          if (p.userId !== userId) {
            console.log(`API emitting 'newMessageNotification' to user-${p.userId}`);
            io.to(`user-${p.userId}`).emit('newMessageNotification', notificationPayload);
          }
        });
      } else {
        console.warn('Socket.IO not available, skipping broadcast.');
      }

      // 3. Respond to the original request
      // Prepare response payload (similar to broadcast payload)
      const responsePayload = {
        ...newMessage,
        sentAt: newMessage.sentAt.toISOString(),
        sender: {
          ...newMessage.sender,
          last_active: newMessage.sender.last_active?.toISOString(),
          is_online: newMessage.sender.last_active ? (new Date().getTime() - new Date(newMessage.sender.last_active).getTime()) < 5 * 60 * 1000 : false
        }
      };
      res.status(201).json(responsePayload);

    } catch (error) {
      logError("POST /api/messages/[chatRoomId] Error:", error);
      res.status(500).json({ message: 'Failed to create message' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

export default withAuth(handler); // Apply authentication middleware