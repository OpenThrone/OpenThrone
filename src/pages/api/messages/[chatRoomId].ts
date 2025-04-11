import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { getSocketIO } from '@/lib/socket';
import { withAuth } from '@/middleware/auth';
import { logError } from '@/utils/logger';
import { Session } from 'next-auth'; // Import Session type
import { Prisma } from '@prisma/client'; // Import Prisma for types

// Define a custom request type that includes the session injected by withAuth
interface AuthenticatedRequest extends NextApiRequest {
  session: Session;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) { // Use AuthenticatedRequest
  const { chatRoomId } = req.query;
  const session = req.session; // Now correctly typed

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
          reactions: { // Include reactions
            select: {
              userId: true,
              reaction: true,
              user: { select: { id: true, display_name: true } } // Include reactor's info
            }
          },
          readBy: { // Include read statuses
            select: {
              userId: true,
              readAt: true,
              user: { select: { id: true, display_name: true } } // Include reader's info
            }
          },
          replyToMessage: { // Include replied-to message details
            select: {
              id: true,
              content: true,
              sender: { select: { id: true, display_name: true } }
            }
          },
          sharedAttackLog: { // Include shared attack log details
            select: {
              id: true,
              attacker_id: true,
              defender_id: true,
              winner: true,
              timestamp: true,
              // Optionally include attacker/defender names here if needed (requires more relations)
              // attackerPlayer: { select: { display_name: true } },
              // defenderPlayer: { select: { display_name: true } }
            }
          }
          // Add includes for other shared log types if implemented
        }
      });

      // Helper to serialize potentially complex message objects
      const serializeMessageData = (msg: any): any => {
        return JSON.parse(JSON.stringify(msg, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value // Handle BigInt if present
        ));
      };


      const transformedMessages = messages.map(message => {
        const isOnline = message.sender.last_active ?
          (new Date().getTime() - new Date(message.sender.last_active).getTime()) < 5 * 60 * 1000
          : false;

        // Process reactions into a more usable format (e.g., { emoji: count, users: [...] }) if needed,
        // or just pass them through. Passing through for now.
        const reactions = message.reactions.map(r => ({
          userId: r.userId,
          reaction: r.reaction,
          userDisplayName: r.user.display_name,
        }));

        // Process read statuses
        const readBy = message.readBy.map(r => ({
          userId: r.userId,
          readAt: r.readAt.toISOString(),
          userDisplayName: r.user.display_name,
        }));

        // Serialize replyToMessage if it exists
        const replyToMessage = message.replyToMessage ? serializeMessageData(message.replyToMessage) : null;

        // Serialize sharedAttackLog if it exists
        const sharedAttackLog = message.sharedAttackLog ? {
          ...serializeMessageData(message.sharedAttackLog),
          timestamp: message.sharedAttackLog.timestamp?.toISOString(), // Ensure timestamp is string
        } : null;


        return {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          content: message.content,
          messageType: message.messageType, // Include message type
          sentAt: message.sentAt.toISOString(), // Serialize Date
          sender: {
            id: message.sender.id,
            display_name: message.sender.display_name,
            avatar: message.sender.avatar,
            is_online: isOnline
          },
          reactions: reactions, // Include processed reactions
          readBy: readBy, // Include processed read statuses
          replyToMessage: replyToMessage, // Include serialized reply context
          sharedAttackLog: sharedAttackLog, // Include serialized shared log
          // Include other shared log types here
        };
      });
      res.status(200).json(transformedMessages);

    } catch (error) {
      logError("GET /api/messages/[chatRoomId] Error:", error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  }
  // --- POST/PUT/DELETE etc. are removed as message creation/modification is handled via WebSockets ---
  else {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

export default withAuth(handler); // Apply authentication middleware