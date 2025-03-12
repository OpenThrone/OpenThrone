import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ChatRoomList from '@/components/ChatRoomList';
import ChatMessageList from '@/components/ChatMessageList';
import useSocket from '@/hooks/useSocket';
import { Space, Button } from '@mantine/core';
import MainArea from '@/components/MainArea';
import { useSession } from 'next-auth/react';
import NewMessageModal from '@/components/NewMessageModal';

const MessageList = (props) => {
  const [rooms, setRooms] = useState([]);
  const router = useRouter();
  const { data: session } = useSession();
  const { roomId: roomIdParam } = router.query;

  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await fetch('/api/messages');
        const data = await response.json();
        setRooms(data);

        // If we have a roomId in the URL and rooms are loaded, select that room
        if (roomIdParam && data.some(room => room.id === Number(roomIdParam))) {
          setSelectedRoomId(Number(roomIdParam));
        }
      } catch (error) {
        console.error('Failed to fetch rooms:', error);
      }
    };
    fetchRooms();
  }, [roomIdParam]);

  // Fetch messages when selectedRoomId changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (selectedRoomId) {
        try {
          const response = await fetch(`/api/messages/${selectedRoomId}`);
          const data = await response.json();
          setMessages(data);

          // Update URL if needed without full page reload
          if (router.query.roomId !== selectedRoomId.toString()) {
            router.push(`/messaging?roomId=${selectedRoomId}`, undefined, {
              shallow: true
            });
          }
        } catch (error) {
          console.error('Failed to fetch messages:', error);
        }
      } else {
        setMessages([]); // Clear messages if no room selected
      }
    };
    fetchMessages();
  }, [selectedRoomId, router]);

  // Custom room selection handler
  const handleRoomSelect = (roomId) => {
    setSelectedRoomId(roomId);
  };

  return (
    <>
      {session?.user?.id && (
        <RealtimeRooms
          setRooms={setRooms}
          userId={session.user.id}
          selectedRoomId={selectedRoomId}
          setMessages={setMessages}
        />
      )}
      <MessageListComponent
        rooms={rooms}
        setRooms={setRooms}
        router={router}
        selectedRoomId={selectedRoomId}
        setSelectedRoomId={handleRoomSelect}
        messages={messages}
      />
    </>
  );
};

const MessageListComponent = ({
  rooms,
  setRooms,
  router,
  selectedRoomId,
  setSelectedRoomId,
  messages
}) => {
  // Find the currently selected room info
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) || null;

  // State for new message modal
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);

  // Function to handle creating a new message
  const handleNewMessage = async (newRoomId) => {
    // Refresh rooms to include the new room
    const response = await fetch('/api/messages');
    const data = await response.json();
    setRooms(data);

    // Select the newly created room
    if (newRoomId) {
      setSelectedRoomId(newRoomId);
    }
  };

  return (
    <MainArea title="Messaging">
      <div className="flex justify-end p-4">
        <Button onClick={() => setIsNewMessageModalOpen(true)}>New Message</Button>
      </div>
      <div className="flex h-screen"> 
        <div className="w-1/4 bg-gray-900 p-2 overflow-y-auto"> {/* Sidebar */}
          <ChatRoomList
            rooms={rooms}
            onRoomSelect={setSelectedRoomId}
            selectedRoomId={selectedRoomId}
          />
        </div>
        <div className="w-3/4 bg-gray-800 flex flex-col h-full"> {/* Main Chat Area */}
          <ChatMessageList
            selectedRoomId={selectedRoomId}
            messages={messages}
            roomInfo={selectedRoom}
          />
        </div>
      </div>
      <Space h="md" />

      {/* New Message Modal */}
      <NewMessageModal
        opened={isNewMessageModalOpen}
        onClose={() => setIsNewMessageModalOpen(false)}
        onRoomCreated={handleNewMessage} // Callback for when a room is created
      />
    </MainArea>
  );
};

const RealtimeRooms = ({
  setRooms,
  userId,
  selectedRoomId,
  setMessages,
}) => {
  const { addEventListener, removeEventListener } = useSocket(userId);

  useEffect(() => {
    const handleMessageNotification = async (payload: { chatRoomId: number }) => {
      console.log('Received message notification for room:', payload.chatRoomId);
      
      // Always refresh the rooms list to update last message info/unread counts
      const roomsResponse = await fetch('/api/messages');
      const roomsData = await roomsResponse.json();
      setRooms(roomsData);
      
      // Only fetch messages if the notification matches the currently selected room
      if (selectedRoomId && selectedRoomId === payload.chatRoomId) {
        const response = await fetch(`/api/messages/${selectedRoomId}`);
        const data = await response.json();
        setMessages(data);
      }
    };

    addEventListener('messageNotification', handleMessageNotification);

    return () => {
      removeEventListener('messageNotification', handleMessageNotification);
    };
  }, [addEventListener, removeEventListener, selectedRoomId, setMessages, setRooms]);

  return null;
};

export default MessageList;
