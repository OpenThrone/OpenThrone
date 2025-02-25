import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ChatRoomList from '@/components/ChatRoomList';
import ChatMessageList from '@/components/ChatMessageList';
import useSocket from '@/hooks/useSocket';
import { Space, Button } from '@mantine/core';
import MainArea from '@/components/MainArea';
import { useSession } from 'next-auth/react';

const MessageList = (props) => {
  const [rooms, setRooms] = useState([]);
  const router = useRouter();
  const { data: session } = useSession();

  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const fetchRooms = async () => {
      const response = await fetch('/api/messages');
      const data = await response.json();
      setRooms(data);
    };
    fetchRooms();
  }, []);

  return (
    <>
      {session?.user?.id && (
        <RealtimeRooms
          rooms={rooms}
          setRooms={setRooms}
          userId={session.user.id}
          selectedRoomId={selectedRoomId}
          setMessages={setMessages}
          setSelectedRoomId={setSelectedRoomId}
        />
      )}
      <MessageListComponent
        rooms={rooms}
        router={router}
        selectedRoomId={selectedRoomId}
        setSelectedRoomId={setSelectedRoomId}
        messages={messages}
      />
    </>
  );
};

const MessageListComponent = ({ rooms, router, selectedRoomId, setSelectedRoomId, messages }) => {
  return (
    <MainArea title="Messaging">
      <div className="flex justify-end p-4">
        <Button onClick={() => router.push('/messaging/new')}>New Message</Button>
      </div>
      <div className="flex h-screen"> 
        <div className="w-1/4 bg-gray-900 p-2 overflow-y-auto"> {/* Sidebar */}
          <ChatRoomList rooms={rooms} onRoomSelect={setSelectedRoomId} />
        </div>
        <div className="w-3/4 bg-gray-800 flex flex-col h-full"> {/* Main Chat Area */}
          <ChatMessageList selectedRoomId={selectedRoomId} messages={messages} />
        </div>
      </div>
      <Space h="md" />
    </MainArea>
  );
};

const RealtimeRooms = ({
  rooms,
  setRooms,
  userId,
  selectedRoomId,
  setMessages,
  setSelectedRoomId,
}) => {
  const { addEventListener, removeEventListener } = useSocket(userId);

  useEffect(() => {
    // Adjust the event handler to receive the payload
    const handleMessageNotification = async (payload: { chatRoomId: number }) => {
      console.log('Received message notification for room:', payload.chatRoomId);
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
  }, [addEventListener, removeEventListener, selectedRoomId, setMessages]);

  return null;
};

export default MessageList;
