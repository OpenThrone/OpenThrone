import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ChatRoomList from '@/components/ChatRoomList';
import { Space } from '@mantine/core';
import MainArea from '@/components/MainArea';

const MessageList = (props) => {
  const [rooms, setRooms] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const fetchRooms = async () => {
      const response = await fetch('/api/messages');
      const data = await response.json();
      setRooms(data);
    };
    fetchRooms();
  }, []);

  return (
    <MainArea title="Messaging">
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded"
        onClick={() => router.push('/messaging/new')}
      >
        New Message
      </button>

      <Space h="md" />

      {/* Chat Room List */}
      <ChatRoomList rooms={rooms} />
    </MainArea>
  );
};

export default MessageList;
