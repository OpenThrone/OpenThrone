import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import ChatRoomList from '@/components/ChatRoomList';
import ChatMessageList from '@/components/ChatMessageList';
import useSocket from '@/hooks/useSocket';
import { Space, Button } from '@mantine/core';
import MainArea from '@/components/MainArea';
import { useSession } from 'next-auth/react';
import NewMessageModal from '@/components/NewMessageModal';
import { useUser } from '@/context/users'; // Import useUser

const MessageList = (props) => {
  const [rooms, setRooms] = useState([]);
  const router = useRouter();
  const { data: session } = useSession();
  const { roomId: roomIdParam } = router.query;
  const { markRoomAsRead } = useUser(); // Get the function from context

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false); // Add loading state

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) throw new Error('Failed to fetch rooms');
      const data = await response.json();
      setRooms(data);

      // If we have a roomId in the URL and rooms are loaded, select that room
      if (roomIdParam && !selectedRoomId && data.some(room => room.id === Number(roomIdParam))) {
        setSelectedRoomId(Number(roomIdParam));
        markRoomAsRead(Number(roomIdParam)); // Mark as read when selected via URL
      } else if (!roomIdParam && data.length > 0 && !selectedRoomId) {
        // Optionally select the first room if none specified
        // setSelectedRoomId(data[0].id);
        // markRoomAsRead(data[0].id);
      }
    } catch (error) {
      logError('Failed to fetch rooms:', error);
    }
  }, [roomIdParam, selectedRoomId, markRoomAsRead]); // Add dependencies

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]); // Fetch rooms on mount

  // Fetch messages when selectedRoomId changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (selectedRoomId) {
        setLoadingMessages(true); // Start loading
        try {
          const response = await fetch(`/api/messages/${selectedRoomId}`);
          if (!response.ok) throw new Error('Failed to fetch messages');
          const data = await response.json();
          setMessages(data);

          // Update URL if needed without full page reload
          if (router.query.roomId !== selectedRoomId.toString()) {
            router.push(`/messaging?roomId=${selectedRoomId}`, undefined, {
              shallow: true
            });
          }
        } catch (error) {
          logError('Failed to fetch messages:', error);
          setMessages([]); // Clear messages on error
        } finally {
          setLoadingMessages(false); // Stop loading
        }
      } else {
        setMessages([]); // Clear messages if no room selected
      }
    };
    fetchMessages();
  }, [selectedRoomId, router]); // Add router to dependency array

  // Custom room selection handler
  const handleRoomSelect = useCallback((roomId: number) => {
    setSelectedRoomId(roomId);
    markRoomAsRead(roomId); // Mark room as read when selected by user
  }, [markRoomAsRead]); // Add dependency

  // Refresh rooms when a new message notification arrives globally
  const handleNewMessageGlobally = useCallback(() => {
    fetchRooms(); // Refetch rooms list to update last message etc.
  }, [fetchRooms]);

  return (
    <>
      {session?.user?.id && (
        <RealtimeMessageHandler
          userId={Number(session.user.id)} // Ensure userId is number
          selectedRoomId={selectedRoomId}
          setMessages={setMessages} // Pass setter to update messages directly
          onNewMessageNotification={handleNewMessageGlobally} // Callback to refresh rooms
          setRooms={setRooms} // Pass down for updating rooms
        />
      )}
      <MessageListComponent
        rooms={rooms}
        setRooms={setRooms} // Pass down for modal callback
        selectedRoomId={selectedRoomId}
        setSelectedRoomId={handleRoomSelect}
        messages={messages}
        loadingMessages={loadingMessages} // Pass loading state
      />
    </>
  );
};

const MessageListComponent = ({
  rooms,
  setRooms, // Receive setRooms
  selectedRoomId,
  setSelectedRoomId,
  messages,
  loadingMessages, // Receive loading state
}) => {
  const selectedRoom = useMemo(() => rooms.find(room => room.id === selectedRoomId) || null, [rooms, selectedRoomId]);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);

  // Simplified handler: relies on RealtimeMessageHandler to update rooms
  const handleNewMessage = (newRoomId?: number) => {
    if (newRoomId) {
      setSelectedRoomId(newRoomId); // Select the new room
    }
    // No need to manually fetch rooms here if RealtimeMessageHandler does it
  };

  return (
    <MainArea title="Messaging">
      <div className="flex justify-end p-4">
        <Button onClick={() => setIsNewMessageModalOpen(true)}>New Message</Button>
      </div>
      <div className="flex h-[calc(100vh-250px)]"> {/* Adjust height calculation as needed */}
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
            isLoading={loadingMessages} // Pass loading state
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

// Renamed component to better reflect its purpose
const RealtimeMessageHandler = ({
  userId,
  selectedRoomId,
  setMessages, // Keep this for updating the current room
  setRooms, // ADD setRooms prop
  onNewMessageNotification,
}) => {
  const { addEventListener, removeEventListener, socket, isConnected } = useSocket(userId); // Add isConnected
  const currentRoomRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket || !userId || !isConnected ) return;

    // Join/Leave Room Logic
    if (selectedRoomId !== currentRoomRef.current) {
      // Leave previous room if applicable
      if (currentRoomRef.current !== null) {
        console.log(`Socket ${socket.id} leaving room-${currentRoomRef.current}`);
        socket.emit('leaveRoom', currentRoomRef.current);
      }
      // Join new room if selected
      if (selectedRoomId !== null) {
        console.log(`Socket ${socket.id} joining room-${selectedRoomId}`);
        socket.emit('joinRoom', selectedRoomId);
        currentRoomRef.current = selectedRoomId;
      } else {
        currentRoomRef.current = null; // No room selected
      }
    }

    // Handler for receiving a message in a specific room
    const handleReceiveMessage = (messageData: any) => {
      console.log('Received socket message in room:', messageData.roomId, 'Selected room:', selectedRoomId);
      
      if (messageData.roomId === selectedRoomId) {
        console.log('Adding message to current room:', messageData);
        setMessages((prev) => {
          // Replace optimistic message or add new one
          const optimisticIndex = prev.findIndex(msg => msg.isOptimistic && msg.tempId === messageData.tempId);
          if (optimisticIndex > -1) {
            // Found the optimistic message, replace it with the confirmed one
            const newState = [...prev];
            newState[optimisticIndex] = { ...messageData, isOptimistic: false }; // Mark as not optimistic
            return newState;
          } else if (!prev.some(msg => msg.id === messageData.id)) {
            // Didn't find optimistic, and don't have confirmed one yet, add it
            return [...prev, { ...messageData, isOptimistic: false }];
          }
          // Already have the confirmed message, do nothing
          return prev;
        });
      } else {
         console.log(`Message for room ${messageData.roomId}, but currently viewing ${selectedRoomId}`);
         // Optimistically update the specific room in the list
        setRooms(prevRooms => {
          return prevRooms.map(room => {
            if (room.id === messageData.roomId) {
              return {
                ...room,
                lastMessage: messageData.content.substring(0, 50) + (messageData.content.length > 50 ? '...' : ''),
                lastMessageTime: messageData.sentAt,
                lastMessageSender: messageData.sender?.display_name || 'Unknown',
                updatedAt: messageData.sentAt,
              };
            }
            return room;
          }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        });
        onNewMessageNotification(); // Trigger global notification count update
      }
    };

    // Handler for global new message notifications (still useful for global count)
    const handleNewMessage = (notificationData: any) => {
       console.log('Received global notification (context handles count):', notificationData);
       // Trigger the original callback if it does more than just fetchRooms
       onNewMessageNotification();
    };

    console.log('Setting up message listeners for userId:', userId);
    addEventListener('receiveMessage', handleReceiveMessage);
    addEventListener('newMessageNotification', handleNewMessage);

    if (isConnected) {
       socket.emit('registerUser', { userId });
    }

    return () => {
      console.log('Cleaning up message listeners');
      removeEventListener('receiveMessage', handleReceiveMessage);
      removeEventListener('newMessageNotification', handleNewMessage);
      // Leave the current room on cleanup if component unmounts while in a room
      if (currentRoomRef.current !== null && socket) {
        console.log(`Socket ${socket.id} leaving room-${currentRoomRef.current} on cleanup`);
        socket.emit('leaveRoom', currentRoomRef.current);
      }
    };
  }, [socket, userId, selectedRoomId, setMessages, setRooms, addEventListener, removeEventListener, onNewMessageNotification, isConnected]);

  return null;
};

export default MessageList;