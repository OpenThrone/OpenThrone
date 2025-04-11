import React from 'react';
import { useRouter } from 'next/router';
import { Avatar, Text, Group } from '@mantine/core';
import clsx from 'clsx';
import { formatLastMessageTime } from '@/utils/timefunctions';

/**
 * Represents the data structure for a single chat room displayed in the list.
 */
interface RoomListItem {
  /** Unique identifier for the chat room. */
  id: number;
  /** The display name of the room (null for unnamed DMs). */
  name: string | null;
  /** Flag indicating if it's a direct message (true) or a group chat (false). */
  isDirect: boolean;
  /** Optional URL for the room's avatar image. */
  image?: string | null;
  /** The content of the most recent message. */
  lastMessage: string | null;
  /** ISO timestamp string of the most recent message. */
  lastMessageTime: string | null;
  /** Display name of the sender of the most recent message. */
  lastMessageSender: string | null;
  /** Count of unread messages for the current user in this room. */
  unreadCount: number;
}

/**
 * Props for the ChatRoomList component.
 */
interface ChatRoomListProps {
  /** Array of chat room data objects to display. */
  rooms: RoomListItem[];
  /** The ID of the currently selected room, if any. */
  selectedRoomId?: number | null;
  /** Callback function triggered when a room is clicked. */
  onRoomSelect: (roomId: number) => void;
}

/**
 * Renders a list of chat rooms, allowing users to select one.
 * Displays room name, avatar, last message preview, timestamp, and unread count.
 * Highlights the currently selected room.
 */
const ChatRoomList: React.FC<ChatRoomListProps> = ({ rooms, selectedRoomId = null, onRoomSelect }) => {
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
            src={room.image || undefined} // TODO: Use actual room image when available
            size={40}
            radius="xl"
            className="mr-3"
          >
            {/* Fallback avatar uses first letter of name, or 'U' for Direct, 'G' for Group */}
            {room.name ? room.name[0]?.toUpperCase() : (room.isDirect ? 'U' : 'G')}
          </Avatar>

          <div className="flex-1">
            <div className="flex justify-between items-center">
              <Text size="sm" className="text-white font-medium truncate">
                {room.name || `Direct Message`}
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

          {/* Unread count badge */}
          {room.unreadCount > 0 && (
            <div className="ml-2 text-sm text-blue-400 font-bold">{room.unreadCount}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ChatRoomList;
