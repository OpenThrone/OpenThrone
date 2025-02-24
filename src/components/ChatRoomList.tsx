import React from 'react';
import { useRouter } from 'next/router';
import { Avatar, Text, Group } from '@mantine/core';
import clsx from 'clsx';
import { formatLastMessageTime } from '@/utils/timefunctions';

interface ChatRoomListProps {
  rooms: any[];
  selectedRoomId?: any;
  onRoomSelect: (roomId: any) => void;
}

const ChatRoomList: React.FC<ChatRoomListProps> = ({ rooms, selectedRoomId = 0, onRoomSelect }) => {
  const router = useRouter();

  
  return (
    <div className="h-full flex flex-col space-y-1 overflow-y-auto">
      {rooms.map((room) => (
        <div
          key={room.id}
          className={clsx("flex items-center p-2.5  rounded-lg cursor-pointer transition", selectedRoomId === room.id ? "bg-gray-700" : "bg-gray-700 hover:bg-gray-800")}
          onClick={() => onRoomSelect(room.id)}
        >
          <Avatar
            src={room.image || undefined} // Not used yet
            size={40}
            radius="xl"
            className="mr-3"
          >
            {room.name ? room.name[0]?.toUpperCase() : 'R'}
          </Avatar>

          {/* Room Details */}
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <Text size="sm" className="text-white font-medium">
                {room.name || `Room #${room.id}`}
              </Text>
              {room.lastMessageTime && (
                <Text size="sm" className="text-gray-400">
                  {formatLastMessageTime(room.lastMessageTime)}
                </Text>
              )}
            </div>
            <Text size="xs" className="text-sm text-gray-400 truncate">
              {room.lastMessageSender
                ? `${room.lastMessageSender}: ${room.lastMessage}`
                : 'No messages yet'}
            </Text>
          </div>

          {/* Metadata (e.g., unread count) */}
          {room.unreadCount > 0 && (
            <div className="ml-2 text-sm text-blue-400 font-bold">{room.unreadCount}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ChatRoomList;
