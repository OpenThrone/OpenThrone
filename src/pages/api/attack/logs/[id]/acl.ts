import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Extract the log ID from the URL
    const logId = parseInt(req.query.id as string, 10);
    if (isNaN(logId)) {
      return res.status(400).json({ message: 'Invalid log ID' });
    }

    // Extract user and room information from the request body
    const { userId, roomId, participantIds } = req.body;
    
    if (!userId || !roomId) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Verify the attack log exists and the current user has access to it
    const attackLog = await prisma.attack_log.findUnique({
      where: { id: logId },
    });

    if (!attackLog) {
      return res.status(404).json({ message: 'Attack log not found' });
    }

    // Check if the user has permission to share this log
    // User must be either attacker or defender
    const userHasAccess = 
      attackLog.attacker_id === userId || 
      attackLog.defender_id === userId;

    // If not attacker or defender, check if they already have ACL access
    if (!userHasAccess) {
      const existingAcl = await prisma.attack_log_acl.findFirst({
        where: {
          attack_log_id: logId,
          shared_with_user_id: userId,
        }
      });
      
      if (!existingAcl) {
        return res.status(403).json({ message: 'You do not have permission to share this attack log' });
      }
    }

    // Verify room exists and user is a participant
    const chatRoom = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: true,
      },
    });

    if (!chatRoom) {
      return res.status(404).json({ message: 'Chat room not found' });
    }

    // Check if the user is a participant in this room
    const isParticipant = chatRoom.participants.some(
      participant => participant.userId === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ message: 'You are not a participant in this chat room' });
    }

    // Get the IDs of all participants in the room (excluding the current user)
    const roomParticipantIds = chatRoom.participants
      .filter(participant => participant.userId !== userId)
      .map(participant => participant.userId);

    // Get existing ACL entries for this log
    const existingAcls = await prisma.attack_log_acl.findMany({
      where: {
        attack_log_id: logId,
        shared_with_user_id: {
          in: roomParticipantIds
        }
      },
      select: {
        shared_with_user_id: true
      }
    });

    // Create a Set of user IDs that already have access for quick lookup
    const existingAccessUserIds = new Set(existingAcls.map(acl => acl.shared_with_user_id));

    // Create ACL entries for participants who don't already have access
    const aclEntries = [];
    for (const participantId of roomParticipantIds) {
      // Skip if this participant already has access
      if (!existingAccessUserIds.has(participantId)) {
        aclEntries.push({
          attack_log_id: logId,
          shared_with_user_id: participantId,
          // TODO: Add these fields later to the schema:
          // granted_by: userId,
          // granted_at: new Date(),
        });
      }
    }

    // Create new ACL entries individually to better handle errors
    const createdAcls = [];
    const skippedAcls = [];
    
    if (aclEntries.length > 0) {
      for (const entry of aclEntries) {
        try {
          const acl = await prisma.attack_log_acl.create({
            data: entry
          });
          createdAcls.push(acl);
        } catch (e) {
          // Handle potential unique constraint violations
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            console.log(`Skipping duplicate ACL entry for user ${entry.shared_with_user_id}`);
            skippedAcls.push(entry.shared_with_user_id);
          } else {
            throw e; // Rethrow other errors
          }
        }
      }
    }

    // Return success
    return res.status(200).json({
      success: true,
      message: `Attack log shared successfully: ${createdAcls.length} new participants, ${skippedAcls.length} already had access`,
      created: createdAcls.length,
      skipped: skippedAcls.length,
      sharedWithNew: createdAcls.map(entry => entry.shared_with_user_id),
      sharedWithExisting: skippedAcls
    });
  } catch (error) {
    console.error('Error sharing attack log:', error);
    return res.status(500).json({
      message: 'An error occurred while sharing the attack log',
      error: error.message,
    });
  }
}

export default withAuth(handler);