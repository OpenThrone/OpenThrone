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
      });
      res.status(200).json(messages);
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
