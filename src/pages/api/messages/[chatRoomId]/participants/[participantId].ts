import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { ChatRole } from '@prisma/client'; // Import Enum

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = req.session;
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const currentUserId = Number(session.user.id);
  const roomId = Number(req.query.chatRoomId);
  const targetUserId = Number(req.query.participantId); // The user being managed
  const { action, canWrite } = req.body; // Action like 'promote', 'demote', 'remove', 'updatePermissions'

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    // 1. Verify current user is an ADMIN in this room
    const currentUserParticipant = await prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: currentUserId } },
      select: { role: true }
    });

    if (!currentUserParticipant || currentUserParticipant.role !== ChatRole.ADMIN) {
      return res.status(403).json({ message: 'Forbidden: You do not have admin rights in this room.' });
    }

    // 2. Verify target user is actually in the room (except for 'remove' maybe)
    const targetParticipant = await prisma.chatRoomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } }
    });

    if (!targetParticipant && action !== 'remove') { // Allow remove even if already gone? Maybe not needed.
      return res.status(404).json({ message: 'Target user is not in this room.' });
    }
    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "You cannot manage your own role or permissions." });
    }


    // --- Handle Actions ---
    if (req.method === 'PATCH') {
      let updateData: any = {};

      switch (action) {
        case 'promote':
          if (targetParticipant?.role === ChatRole.MEMBER) {
            updateData.role = ChatRole.ADMIN;
          } else {
            return res.status(400).json({ message: 'User is already an admin or action is invalid.' });
          }
          break;
        case 'demote':
          if (targetParticipant?.role === ChatRole.ADMIN) {
            updateData.role = ChatRole.MEMBER;
          } else {
            return res.status(400).json({ message: 'User is already a member or action is invalid.' });
          }
          break;
        case 'updatePermissions':
          if (typeof canWrite !== 'boolean') {
            return res.status(400).json({ message: 'Invalid value for canWrite permission.' });
          }
          updateData.canWrite = canWrite;
          break;
        default:
          return res.status(400).json({ message: 'Invalid action specified.' });
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.chatRoomParticipant.update({
          where: { roomId_userId: { roomId, userId: targetUserId } },
          data: updateData
        });
        return res.status(200).json({ message: `Permissions updated successfully for user ${targetUserId}.` });
      } else {
        return res.status(400).json({ message: 'No changes applied.' });
      }

    } else if (req.method === 'DELETE' || action === 'remove') { // Handle removal
      // Prevent removing the last admin if they are the only admin left
      if (targetParticipant?.role === ChatRole.ADMIN) {
        const adminCount = await prisma.chatRoomParticipant.count({
          where: { roomId, role: ChatRole.ADMIN }
        });
        if (adminCount <= 1) {
          return res.status(400).json({ message: 'Cannot remove the last admin.' });
        }
      }

      await prisma.chatRoomParticipant.delete({
        where: { roomId_userId: { roomId, userId: targetUserId } }
      });
      return res.status(200).json({ message: `User ${targetUserId} removed from room.` });
    }

  } catch (error) {
    console.error("Error managing participant:", error);
    res.status(500).json({ message: 'Failed to manage participant.' });
  }
}

export default withAuth(handler);