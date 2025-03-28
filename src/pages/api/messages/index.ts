import { withAuth } from "@/middleware/auth";
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { logError } from "@/utils/logger";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = Number(req.session.user.id);

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

    // Format the response to include lastMessage, display name, and unread status
    const formattedRooms = rooms.map((room) => {
      // Determine if this is a direct message (only 2 participants and no name)
      const isDirect = room.participants.length === 2 && !room.name;
      
      // For direct messages, use the other participant's name as the room name
      let displayName = room.name;
      let otherParticipant = null;
      
      if (isDirect) {
        // Find the other participant (not the current user)
        otherParticipant = room.participants.find(p => p.userId !== userId)?.user;
        displayName = otherParticipant?.display_name || 'Unknown User';
      }
      
      // Calculate unread messages (to be implemented later with read receipts)
      // For now just using a placeholder
      const unreadCount = 0; // This would need to be calculated from a read receipts table
      
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
        // Get unique recipient IDs (including current user)
        const allParticipantIds = [...new Set([userId, ...recipients.map(id => Number(id))])];

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
      // First, deduplicate recipients and ensure current user isn't included twice
      const uniqueRecipients = [...new Set(recipients.map(id => Number(id)))];

      
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
      // Check if this is a unique constraint error for an existing conversation
      if (error.code === 'P2002' && error.meta?.target?.includes('roomId_userId')) {
        // Find existing room with these participants
        const recipientId = Number(recipients[0]);

        try {
          // Find the room where both users are participants
          const existingRoom = await prisma.chatRoom.findFirst({
            where: {
              participants: {
                some: { userId }
              },
              AND: {
                participants: {
                  some: { userId: recipientId }
                }
              }
            }
          });

          if (existingRoom) {
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
        } catch (recoverError) {
          logError('Error recovering from unique constraint:', recoverError);
        }
      }
      return res.status(500).json({ message: 'Failed to create conversation' });
    }
  }

  res.status(405).end();
}

export default withAuth(handler);
