import React from 'react';
import { useRouter } from 'next/router';
import { Avatar, Text, Group } from '@mantine/core';
import clsx from 'clsx';

const ChatRoomList = ({ rooms }) => {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {rooms.map((room) => (
        <div
          key={room.id}
          className={clsx(
            'flex items-center p-3 bg-gray-800 hover:bg-gray-700 rounded-lg cursor-pointer transition'
          )}
          onClick={() => router.push(`/messaging/read/${room.id}`)}
        >
          {/* Avatar or Placeholder - Maybe something like how teams groups users images together? */}
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
            <Text className="text-white font-medium">{room.name || `Room #${room.id}`}</Text>
            <Text className="text-sm text-gray-400 truncate">
              {room.lastMessageSender + ': ' + room.lastMessage || 'No messages yet'}
            </Text>
            {room.lastMessageTime && (
              <Text size='xs' className="text-gray-500">{new Date(room.lastMessageTime).toLocaleString()}</Text>
            )}
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
