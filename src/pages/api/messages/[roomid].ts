import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { roomid } = req.query;

  // Verify user access
  const userId = req.session.user.id;
  const room = await prisma.chatRoom.findUnique({
    where: { id: Number(roomid) },
    include: { participants: true },
  });

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const isParticipant = room.participants.some((p) => p.userId === userId);
  const isAdmin = room.createdById === userId;

  if (!isParticipant && !isAdmin) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (req.method === 'GET') {
    const messages = await prisma.chatMessage.findMany({
      where: { roomId: Number(roomid) },
      include: {
        sender: {
          select: { id: true, display_name: true, avatar: true, last_active: true },
        },
      },
    });
    return res.json(messages);
  }

  if (req.method === 'POST') {
    const { content } = req.body;
    const newMessage = await prisma.chatMessage.create({
      data: {
        roomId: Number(roomid),
        senderId: userId,
        content,
      },
    });
    return res.json(newMessage);
  }

  res.status(405).end();
}

export default withAuth(handler);
