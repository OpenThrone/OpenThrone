import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import ChatRoomList from '@/components/ChatRoomList';
import ChatMessageList from '@/components/ChatMessageList';
import useSocket from '@/hooks/useSocket';
import { Space, Button } from '@mantine/core';
import MainArea from '@/components/MainArea';
import { useSession } from 'next-auth/react';
import NewMessageModal from '@/components/NewMessageModal';
import { useUser } from '@/context/users';
import { logError, logInfo } from '@/utils/logger';

// Define a type for the message structure used in the frontend state
interface FrontendMessage {
  id: number;
  roomId: number;
  senderId: number;
  content: string;
  messageType: string;
  sentAt: string; // ISO string
  sender: {
    id: number;
    display_name: string;
    avatar: string | null;
    is_online: boolean;
  };
  reactions: {
    userId: number;
    reaction: string;
    userDisplayName: string;
  }[];
  readBy: {
    userId: number;
    readAt: string; // ISO string
    userDisplayName: string;
  }[];
  replyToMessage: {
    id: number;
    content: string;
    sender: { id: number; display_name: string };
  } | null;
  sharedAttackLog: {
    id: number;
    attacker_id: number;
    defender_id: number;
    winner: number;
    timestamp: string | null; // ISO string
  } | null;
  isOptimistic?: boolean;
  tempId?: number;
}

// Define type for Room state
interface FrontendRoom {
  id: number;
  name: string | null;
  isPrivate: boolean;
  isDirect: boolean;
  createdById: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastMessage: string | null;
  lastMessageTime: string | null; // ISO string
  lastMessageSender: string | null;
  unreadCount: number;
  isAdmin: boolean;
  participants: {
    id: number;
    role: "ADMIN" | "MEMBER";
    canWrite: boolean;
    display_name: string;
    avatar: string | null;
    is_online: boolean;
  }[];
}


const MessageList = (props) => {
  const [rooms, setRooms] = useState<FrontendRoom[]>([]);
  const router = useRouter();
  const { data: session } = useSession();
  const { roomId: roomIdParam } = router.query;
  const { markRoomAsRead } = useUser();

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<FrontendMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) throw new Error('Failed to fetch rooms');
      const data: FrontendRoom[] = await response.json();
      setRooms(data);

      // Auto-select room based on URL param or first room *only if no room is currently selected*
      if (selectedRoomId === null) { // Check if a room isn't already selected
        let roomToSelect: number | null = null;
        const paramRoomId = roomIdParam ? Number(roomIdParam) : null;

        if (paramRoomId && data.some(room => room.id === paramRoomId)) {
          // Select room from URL parameter if valid
          roomToSelect = paramRoomId;
        } else if (data.length > 0) {
          // Otherwise, select the first room in the list
          roomToSelect = data[0].id;
        }

        // If we found a room to auto-select, update the state
        if (roomToSelect !== null) {
           logInfo(`Auto-selecting room ${roomToSelect}`);
           setSelectedRoomId(roomToSelect);
           markRoomAsRead(roomToSelect);
        }
      }

    } catch (error) {
      logError('Failed to fetch rooms:', error);
    }
  }, [roomIdParam, markRoomAsRead, selectedRoomId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (selectedRoomId) {
        setLoadingMessages(true);
        try {
          const response = await fetch(`/api/messages/${selectedRoomId}`);
          if (!response.ok) throw new Error('Failed to fetch messages');
          const data: FrontendMessage[] = await response.json();
          setMessages(data);

          if (router.query.roomId !== selectedRoomId.toString()) {
            router.push(`/messaging?roomId=${selectedRoomId}`, undefined, { shallow: true });
          }
        } catch (error) {
          logError('Failed to fetch messages:', error);
          setMessages([]);
        } finally {
          setLoadingMessages(false);
        }
      } else {
        setMessages([]);
      }
    };
    fetchMessages();
  }, [selectedRoomId, router]);

  const handleRoomSelect = useCallback((roomId: number) => {
    setSelectedRoomId(roomId);
    markRoomAsRead(roomId);
  }, [markRoomAsRead]);

  return (
    <>
      {session?.user?.id && (
        <RealtimeMessageHandler
          userId={Number(session.user.id)}
          selectedRoomId={selectedRoomId}
          setMessages={setMessages}
          fetchRooms={fetchRooms} // Pass fetchRooms directly
          setRooms={setRooms}
        />
      )}
      <MessageListComponent
        rooms={rooms}
        setRooms={setRooms}
        selectedRoomId={selectedRoomId}
        setSelectedRoomId={handleRoomSelect}
        messages={messages}
        loadingMessages={loadingMessages}
      />
    </>
  );
};

const MessageListComponent = ({
  rooms,
  setRooms,
  selectedRoomId,
  setSelectedRoomId,
  messages,
  loadingMessages,
}: {
  rooms: FrontendRoom[];
  setRooms: React.Dispatch<React.SetStateAction<FrontendRoom[]>>;
  selectedRoomId: number | null;
  setSelectedRoomId: (id: number) => void;
  messages: FrontendMessage[];
  loadingMessages: boolean;
}) => {
  const selectedRoom = useMemo(() => rooms.find(room => room.id === selectedRoomId) || null, [rooms, selectedRoomId]);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);

  const handleNewMessage = (newRoomId?: number) => {
    if (newRoomId) {
      setSelectedRoomId(newRoomId);
    }
    fetch('/api/messages')
      .then(res => res.json())
      .then(data => setRooms(data))
      .catch(err => logError("Error refetching rooms after modal", err));
  };

  return (
    <MainArea title="Messaging">
      <div className="flex justify-end p-4">
        <Button onClick={() => setIsNewMessageModalOpen(true)}>New Message</Button>
      </div>
      <div className="flex h-[calc(100vh-250px)]">
        <div className="w-1/4 bg-gray-900 p-2 overflow-y-auto border-r border-gray-700">
          <ChatRoomList
            rooms={rooms}
            onRoomSelect={setSelectedRoomId}
            selectedRoomId={selectedRoomId}
          />
        </div>
        <div className="w-3/4 bg-gray-800 flex flex-col h-full">
          <ChatMessageList
            selectedRoomId={selectedRoomId}
            messages={messages}
            roomInfo={selectedRoom}
            isLoading={loadingMessages}
          />
        </div>
      </div>
      <Space h="md" />
      <NewMessageModal
        opened={isNewMessageModalOpen}
        onClose={() => setIsNewMessageModalOpen(false)}
        onRoomCreated={handleNewMessage}
      />
    </MainArea>
  );
};

// Component to handle WebSocket logic separately
const RealtimeMessageHandler = ({
  userId,
  selectedRoomId,
  setMessages,
  setRooms,
  fetchRooms, // Receive fetchRooms prop
}: {
  userId: number;
  selectedRoomId: number | null;
  setMessages: React.Dispatch<React.SetStateAction<FrontendMessage[]>>;
  setRooms: React.Dispatch<React.SetStateAction<FrontendRoom[]>>;
  fetchRooms: () => Promise<void>; // Type fetchRooms prop
}) => {
  const { addEventListener, removeEventListener, socket, isConnected } = useSocket(userId);
  const currentRoomRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket || !userId || !isConnected) return;

    // --- Join/Leave Room Logic ---
    if (selectedRoomId !== currentRoomRef.current) {
      if (currentRoomRef.current !== null) {
        logInfo(`Socket ${socket.id} leaving room-${currentRoomRef.current}`);
        socket.emit('leaveRoom', currentRoomRef.current);
      }
      if (selectedRoomId !== null) {
        logInfo(`Socket ${socket.id} joining room-${selectedRoomId}`);
        socket.emit('joinRoom', selectedRoomId);
        currentRoomRef.current = selectedRoomId;
      } else {
        currentRoomRef.current = null;
      }
    }

    // --- Define Event Handlers ---
    const handleReceiveMessage = (messageData: FrontendMessage) => {
      logInfo(`[User ${userId}] handleReceiveMessage CALLED. Msg ID: ${messageData.id}, Msg Room: ${messageData.roomId}, Selected Room: ${selectedRoomId}`);
      if (messageData.roomId === selectedRoomId) {
        setMessages((prev) => {
          const optimisticIndex = prev.findIndex(msg => msg.isOptimistic && msg.tempId === messageData.tempId);
          if (optimisticIndex > -1) {
            const newState = [...prev];
            newState[optimisticIndex] = { ...messageData, isOptimistic: false };
            return newState;
          } else if (!prev.some(msg => msg.id === messageData.id)) {
            return [...prev, { ...messageData, isOptimistic: false }];
          }
          return prev;
        });
      }
      setRooms(prevRooms => {
        let roomUpdated = false;
        const updatedRooms = prevRooms.map(room => {
          if (room.id === messageData.roomId) {
            roomUpdated = true;
            return {
              ...room,
              lastMessage: messageData.content.substring(0, 50) + (messageData.content.length > 50 ? '...' : ''),
              lastMessageTime: messageData.sentAt,
              lastMessageSender: messageData.sender?.display_name || 'Unknown',
              updatedAt: messageData.sentAt,
              unreadCount: (messageData.senderId !== userId && messageData.roomId !== selectedRoomId) ? (room.unreadCount || 0) + 1 : room.unreadCount,
            };
          }
          return room;
        });
        if (!roomUpdated) {
           fetchRooms(); // Trigger full refresh if room wasn't found (edge case)
           return prevRooms;
        }
        return updatedRooms.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
      // Trigger global notification update if message is for another room
      if (messageData.roomId !== selectedRoomId) {
         fetchRooms(); // Refresh room list to get latest unread counts
      }
    };

    const handleNewMessageNotification = (notificationData: any) => {
      logInfo('Received global notification, triggering fetchRooms:', notificationData);
      fetchRooms(); // Call the passed fetchRooms directly
    };

    const handleReactionAdded = (data: { messageId: number; userId: number; reaction: string; userDisplayName: string }) => {
      logInfo('Received reactionAdded:', data);
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === data.messageId) {
            const reactionExists = msg.reactions?.some(r => r.userId === data.userId && r.reaction === data.reaction);
            if (!reactionExists) {
              const newReaction = { userId: data.userId, reaction: data.reaction, userDisplayName: data.userDisplayName };
              return { ...msg, reactions: [...(msg.reactions || []), newReaction] };
            }
          }
          return msg;
        })
      );
    };

    const handleReactionRemoved = (data: { messageId: number; userId: number; reaction: string }) => {
       logInfo('Received reactionRemoved:', data);
       setMessages((prevMessages) =>
         prevMessages.map((msg) => {
           if (msg.id === data.messageId) {
             const updatedReactions = (msg.reactions || []).filter(r => !(r.userId === data.userId && r.reaction === data.reaction));
             return { ...msg, reactions: updatedReactions };
           }
           return msg;
         })
       );
    };

    const handleMessagesRead = (data: { roomId: number; updates: { messageId: number; userId: number; readAt: string }[] }) => {
      logInfo('Received messagesRead:', data);
      if (data.roomId === selectedRoomId) {
        setMessages((prevMessages) =>
          prevMessages.map((msg) => {
            const readUpdate = data.updates.find(update => update.messageId === msg.id);
            if (readUpdate) {
              const readerExists = msg.readBy?.some(r => r.userId === readUpdate.userId);
              if (!readerExists) {
                 const updatedReadBy = [...(msg.readBy || [])];
                 updatedReadBy.push({ userId: readUpdate.userId, readAt: readUpdate.readAt, userDisplayName: 'Reader' /* Placeholder */ });
                 return { ...msg, readBy: updatedReadBy };
              }
            }
            return msg;
          })
        );
      }
       setRooms(prevRooms => prevRooms.map(room => {
           if (room.id === data.roomId) {
               const currentUserRead = data.updates.some(u => u.userId === userId);
               return { ...room, unreadCount: currentUserRead ? 0 : room.unreadCount };
           }
           return room;
       }));
    };

    // --- Setup Listeners ---
    logInfo(`[User ${userId}] Setting up ALL message listeners for selectedRoomId: ${selectedRoomId}`);
    addEventListener('receiveMessage', handleReceiveMessage);
    addEventListener('newMessageNotification', handleNewMessageNotification);
    addEventListener('reactionAdded', handleReactionAdded);
    addEventListener('reactionRemoved', handleReactionRemoved);
    addEventListener('messagesRead', handleMessagesRead);

    if (isConnected) {
       socket.emit('registerUser', { userId });
    }

    // --- Cleanup ---
    return () => {
      logInfo(`[User ${userId}] Cleaning up ALL message listeners for selectedRoomId: ${currentRoomRef.current}`);
      removeEventListener('receiveMessage', handleReceiveMessage);
      removeEventListener('newMessageNotification', handleNewMessageNotification);
      removeEventListener('reactionAdded', handleReactionAdded);
      removeEventListener('reactionRemoved', handleReactionRemoved);
      removeEventListener('messagesRead', handleMessagesRead);

      if (currentRoomRef.current !== null && socket) {
        logInfo(`Socket ${socket.id} leaving room-${currentRoomRef.current} on cleanup`);
        socket.emit('leaveRoom', currentRoomRef.current);
      }
    };
    // Aggressively refined dependencies: Only include values that truly dictate when the effect *must* re-run
  }, [socket, userId, selectedRoomId, isConnected, addEventListener, removeEventListener]); // Removed fetchRooms, setMessages, setRooms

  return null;
};

export default MessageList;