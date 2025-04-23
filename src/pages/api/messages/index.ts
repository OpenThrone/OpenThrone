import { withAuth } from "@/middleware/auth";
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { logDebug, logError, logInfo } from "@/utils/logger";
import { Session } from "next-auth"; // Import Session type
import { Prisma } from "@prisma/client"; // Import Prisma

// Define a custom request type that includes the session injected by withAuth
interface AuthenticatedRequest extends NextApiRequest {
  session: Session;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) { // Use AuthenticatedRequest
  const userId = Number(req.session.user.id); // Access session correctly

  if (req.method === "GET") {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        participants: { some: { userId } } // User is a participant
      },
      include: {
        participants: {
          include: {
            user: { 
              select: { 
                id: true,
                display_name: true,
                avatar: true,
                last_active: true
              }
            }
          }
        },
        messages: {
          take: 1, // Fetch the most recent message
          orderBy: { sentAt: "desc" }, // Sort by most recent
          include: {
            sender: { select: { id: true, display_name: true } }
          }
        },
        creator: {
          select: { id: true, display_name: true }
        }
      },
      orderBy: { updatedAt: "desc" } // Sort rooms by last updated
    });

    logInfo("Fetched rooms for user:", userId);

    // Fetch all read statuses for the user to build a lookup map
    const userReadStatuses = await prisma.chatMessageReadStatus.findMany({
      where: { userId: userId },
      select: { readAt: true, message: { select: { roomId: true } } } // Select roomId via message relation
    });

    // Create a map of roomId -> latest readAt timestamp
    const lastReadByRoom = userReadStatuses.reduce((acc, status) => {
      // Ensure message and roomId exist (should always be true based on schema)
      if (status.message && status.message.roomId) {
        const roomId = status.message.roomId;
        if (!acc[roomId] || status.readAt > acc[roomId]) {
          acc[roomId] = status.readAt;
        }
      }
      return acc;
    }, {} as Record<number, Date>);


    // Format the response - use Promise.all for async operations inside map
    const formattedRoomsPromises = rooms.map(async (room) => {
      const isDirect = room.participants.length === 2 && !room.name;
      let displayName = room.name;
      let otherParticipant = null;

      if (isDirect) {
        otherParticipant = room.participants.find(p => p.userId !== userId)?.user;
        displayName = otherParticipant?.display_name || 'Unknown User';
      }

      // Calculate unread messages
      const lastReadTimestamp = lastReadByRoom[room.id] || new Date(0); // Default to epoch if never read

      const unreadCount = await prisma.chatMessage.count({
        where: {
          roomId: room.id,
          senderId: { not: userId }, // Messages sent by others
          sentAt: { gt: lastReadTimestamp } // Sent after the user last read
        }
      });

      // Check if user is an admin (creator or has ADMIN role)
      const userParticipant = room.participants.find(p => p.userId === userId);
      const isAdmin = room.createdById === userId || userParticipant?.role === 'ADMIN';
      
      return {
        id: room.id,
        name: displayName,
        isPrivate: room.isPrivate,
        isDirect: isDirect,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        lastMessage: room.messages[0]?.content || null,
        lastMessageTime: room.messages[0]?.sentAt || null,
        lastMessageSender: room.messages[0]?.sender.display_name || null,
        unreadCount: unreadCount,
        isAdmin: isAdmin,
        // For direct messages, include info about the other person
        participants: room.participants.map(p => ({
          id: p.user.id,
          role: p.role,
          canWrite: p.canWrite,
          display_name: p.user.display_name,
          avatar: p.user.avatar,
          is_online: p.user.last_active ? 
              (new Date().getTime() - new Date(p.user.last_active).getTime()) < 5 * 60 * 1000 
              : false
          }
        )),
      };
    });

    logInfo("Formatted rooms for user:", userId);

    // Resolve all promises from the map
    const formattedRooms = await Promise.all(formattedRoomsPromises);

    logInfo("Returning formatted rooms for user:", userId);
    logDebug("Formatted rooms:", formattedRooms);

    return res.json(formattedRooms);
  }

  if (req.method === "POST") {
    const { name, recipients, message, isPrivate = true } = req.body;
    
    // Validate request data
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: 'At least one recipient is required' });
    }

    // Check if this is a direct message (only one recipient, no name)
    const isDirect = recipients.length === 1 && !name;
    
    try {
      // For direct messages, check if a room already exists with this recipient
      if (isDirect) {
        const recipientId = Number(recipients[0]);
        
        // Find existing direct message room between these two users
        const existingRoom = await prisma.chatRoom.findFirst({
          where: {
            name: null, // Direct messages have no name
            participants: {
              every: {
                userId: {
                  in: [userId, recipientId]
                }
              }
            }
          },
          include: {
            participants: true,
            _count: {
              select: {
                participants: true
              }
            }
          }
        });
        
        // If room exists with exactly 2 participants, add the new message to it
        if (existingRoom && existingRoom._count.participants === 2) {
          // Add new message to existing room
          if (message && message.trim()) {
            await prisma.chatMessage.create({
              data: {
                roomId: existingRoom.id,
                senderId: userId,
                content: message
              }
            });
          }
          
          return res.json({
            id: existingRoom.id,
            isExisting: true,
            message: 'Message sent to existing conversation'
          });
        }
      } else {
        // For group chats, check if there's already a room with exactly these participants
        // Get unique recipient IDs (including current user) - Use Array.from for older TS targets
        const allParticipantIds = Array.from(new Set([userId, ...recipients.map(id => Number(id))]));

        // Look for existing rooms where all these users are participants and no one else
        const existingRooms = await prisma.chatRoom.findMany({
          where: {
            // Must include all participants
            participants: {
              every: {
                userId: {
                  in: allParticipantIds
                }
              }
            },
            // Must not include any other participants
            AND: {
              participants: {
                none: {
                  userId: {
                    notIn: allParticipantIds
                  }
                }
              }
            },
            // For named rooms, match the name too
            ...(name ? { name } : {})
          },
          include: {
            participants: true,
            _count: {
              select: {
                participants: true
              }
            }
          }
        });

        // If a matching room exists with the exact same participants, use it
        const exactMatch = existingRooms.find(room =>
          room._count.participants === allParticipantIds.length
        );

        if (exactMatch) {
          // Add new message to existing room
          if (message && message.trim()) {
            await prisma.chatMessage.create({
              data: {
                roomId: exactMatch.id,
                senderId: userId,
                content: message
              }
            });
          }

          return res.json({
            id: exactMatch.id,
            isExisting: true,
            message: 'Message sent to existing conversation'
          });
        }
      }

      // If we get here, we need to create a new room
      // First, deduplicate recipients - Use Array.from for older TS targets
      const uniqueRecipients = Array.from(new Set(recipients.map(id => Number(id))));

      
      // Create a new room
      const newRoom = await prisma.chatRoom.create({
        data: {
          name: isDirect ? null : name,
          isPrivate,
          createdById: userId,
          participants: {
            create: [
              // Add current user as participant with appropriate role
              { 
                userId: userId, 
                role: isDirect ? 'MEMBER' : 'ADMIN' 
              },
              // Add all recipients as participants
              ...uniqueRecipients.map((recipientId: number) => ({ 
                userId: Number(recipientId),
                role: 'MEMBER' as const
              }))
            ]
          },
          // Add initial message if provided
          ...(message && message.trim() ? {
            messages: {
              create: { 
                senderId: userId, 
                content: message 
              }
            }
          } : {})
        },
        include: {
          participants: true,
          messages: true
        }
      });
      
      return res.status(201).json({
        id: newRoom.id,
        isExisting: false,
        message: 'New conversation created'
      });
    } catch (error) {
      logError('Error creating chat room:', error);
      // Check if this is a unique constraint error (e.g., trying to add same participant twice)
      // The specific error code for unique constraint violation is P2002
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
         logError('Unique constraint violation during room creation:', error.meta);
         // Attempt recovery for direct messages if applicable (logic might need adjustment based on exact constraint)
         if (isDirect && error.meta?.target === 'ChatRoomParticipant_roomId_userId_key') {
            const recipientId = Number(recipients[0]);
            try {
              // Find the existing room (copied logic from above, might need refinement)
              const existingRoom = await prisma.chatRoom.findFirst({
                 where: {
                   name: null,
                   participants: { every: { userId: { in: [userId, recipientId] } } }
                 },
                 include: { _count: { select: { participants: true } } }
              });

              if (existingRoom && existingRoom._count.participants === 2) {
                 // Add message if provided
                 if (message && message.trim()) {
                   await prisma.chatMessage.create({
                     data: { roomId: existingRoom.id, senderId: userId, content: message }
                   });
                 }
                 return res.json({ id: existingRoom.id, isExisting: true, message: 'Message sent to existing conversation' });
              }
            } catch (recoverError) {
              logError('Error recovering from unique constraint:', recoverError);
            }
         }
         // If recovery fails or it's a different constraint, return a specific error
         return res.status(409).json({ message: 'Conflict: Could not create conversation, possibly due to existing participants.' });
      }
      // Generic error for other issues
      return res.status(500).json({ message: 'Failed to create conversation' });
    }
  }

  res.status(405).end();
}

export default withAuth(handler);
