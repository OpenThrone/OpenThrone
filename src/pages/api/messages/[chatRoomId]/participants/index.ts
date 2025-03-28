import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { ChatRole } from '@prisma/client';
import { logError } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = req.session;
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const currentUserId = Number(session.user.id);
  const roomId = Number(req.query.chatRoomId);

  if (req.method === 'POST') {
    const { userIds } = req.body; // Expecting an array of user IDs to add

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs must be provided as an array.' });
    }

    try {
      // 1. Verify current user is an ADMIN or the room is public/not private
      const room = await prisma.chatRoom.findUnique({
        where: { id: roomId },
        include: {
          participants: { where: { userId: currentUserId }, select: { role: true } }
        }
      });

      if (!room) {
        return res.status(404).json({ message: 'Chat room not found.' });
      }

      const currentUserIsAdmin = room.participants[0]?.role === ChatRole.ADMIN;

      // Only admins can add to private rooms (or check if room allows self-join if public)
      if (room.isPrivate && !currentUserIsAdmin) {
        return res.status(403).json({ message: 'Forbidden: Only admins can add users to this private room.' });
      }

      // 2. Prepare data for new participants
      const participantsToAdd = userIds
        .map(id => Number(id)) // Ensure IDs are numbers
        .filter(id => !isNaN(id) && id !== currentUserId) // Filter out invalid IDs and the current user
        .map(userId => ({
          roomId: roomId,
          userId: userId,
          role: ChatRole.MEMBER, // Default role for new members
          canWrite: true         // Default write permission
        }));

      if (participantsToAdd.length === 0) {
        return res.status(400).json({ message: 'No valid users to add provided.' });
      }

      // 3. Add new participants, ignoring duplicates
      const result = await prisma.chatRoomParticipant.createMany({
        data: participantsToAdd,
        skipDuplicates: true, // IMPORTANT: Prevents errors if a user is already in the room
      });

      // Update room's updatedAt timestamp
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: new Date() },
      });

      return res.status(201).json({ message: `${result.count} user(s) added successfully.` });

    } catch (error) {
      logError("Error adding participants:", error);
      // Handle potential foreign key constraint errors if user IDs don't exist
      if (error.code === 'P2003' || error.code === 'P2025') {
        return res.status(400).json({ message: 'One or more user IDs are invalid.' });
      }
      res.status(500).json({ message: 'Failed to add participants.' });
    }

  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

export default withAuth(handler);