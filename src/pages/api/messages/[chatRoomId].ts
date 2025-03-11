// src/pages/api/messages/[chatRoomId].ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSocketIO } from '@/lib/socket';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chatRoomId } = req.query;
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const messages = await prisma.chatMessage.findMany({
        where: { roomId: Number(chatRoomId) },
        orderBy: { sentAt: 'asc' },
        include: {
          sender: {
            select: { id: true, display_name: true, avatar: true, last_active: true },
          },
        }
      });
      // Transform messages to include is_online flag based on last_active
      const transformedMessages = messages.map(message => {
        // Consider a user online if they've been active in the last 5 minutes
        const isOnline = message.sender.last_active ?
          (new Date().getTime() - new Date(message.sender.last_active).getTime()) < 5 * 60 * 1000
          : false;

        return {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          content: message.content,
          sentAt: message.sentAt,
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
      console.error(error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  } else if (req.method === 'POST') {
    try {
      const { content } = req.body;
      const newMessage = await prisma.chatMessage.create({
        data: {
          roomId: Number(chatRoomId),
          senderId: Number(session.user.id),
          content: content,
        },
      });

      const io = getSocketIO();
      io?.emit('messageNotification', { chatRoomId: Number(chatRoomId) });

      res.status(201).json(newMessage);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to create message' });
    }
  } else {
    res.status(405).json({ message: 'Method Not Allowed' });
  }
}
