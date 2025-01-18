import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ChatRoomList from '@/components/ChatRoomList';

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
    <div className="container mx-auto p-4">
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded"
        onClick={() => router.push('/messaging/new')}
      >
        New Message
      </button>

      {/* Chat Room List */}
      <ChatRoomList rooms={rooms} />
    </div>
  );
};

export default MessageList;
