import { withAuth } from "@/middleware/auth";
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = req.session.user.id;

  if (req.method === "GET") {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [
          { createdById: userId }, // Admin
          { participants: { some: { userId } } }, // Participant
        ],
      },
      include: {
        participants: true,
        messages: {
          take: 1, // Fetch the most recent message
          orderBy: { sentAt: "desc" }, // Sort by most recent
          include: {
            sender: { select: { display_name: true } }
          }
        },
      },
    });

    // Format the response to include lastMessage and lastMessageTime
    const formattedRooms = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      isPrivate: room.isPrivate,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      participants: room.participants,
      lastMessage: room.messages[0]?.content || null, // Most recent message content
      lastMessageTime: room.messages[0]?.sentAt || null, // Most recent message timestamp
      lastMessageSender: room.messages[0]?.sender.display_name || null, // Most recent message sender
    }));

    return res.json(formattedRooms);
  }

  if (req.method === "POST") {
    const { recipients, message } = req.body;
    const newRoom = await prisma.chatRoom.create({
      data: {
        isPrivate: true,
        createdById: userId,
        participants: {
          create: recipients.map((id: number) => ({ userId: id })),
        },
        messages: {
          create: { senderId: userId, content: message },
        },
      },
    });
    return res.json(newRoom);
  }

  res.status(405).end();
}

export default withAuth(handler);
