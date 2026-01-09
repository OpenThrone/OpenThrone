import React from 'react';
import clsx from 'clsx';
import { Avatar, Group, Text } from '@mantine/core';

import { formatLastMessageTime } from '@/utils/timefunctions';

import styles from './ChatThemed.module.css';

interface RoomListItem {
  id: number;
  name: string | null;
  isDirect: boolean;
  image?: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  lastMessageSender: string | null;
  unreadCount: number;
}

interface ChatRoomListThemedProps {
  rooms: RoomListItem[];
  selectedRoomId?: number | null;
  onRoomSelect: (roomId: number) => void;
  title?: string;
}

const ChatRoomListThemed: React.FC<ChatRoomListThemedProps> = ({
  rooms,
  selectedRoomId = null,
  onRoomSelect,
  title = 'Conversations',
}) => {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <Text className={styles.panelTitle}>{title}</Text>
        <Text size="xs" className={styles.roomMeta}>
          {rooms.length} rooms
        </Text>
      </div>
      <div className={styles.roomList}>
        {rooms.map((room) => (
          <div
            key={room.id}
            className={clsx(styles.roomItem, selectedRoomId === room.id && styles.roomItemActive)}
            onClick={() => onRoomSelect(room.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRoomSelect(room.id);
              }
            }}
          >
            <Avatar src={room.image || undefined} size={40} radius="xl">
              {room.name ? room.name[0]?.toUpperCase() : (room.isDirect ? 'U' : 'G')}
            </Avatar>
            <div className="flex-1">
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm" className={styles.roomTitle} truncate>
                  {room.name || 'Direct Message'}
                </Text>
                {room.lastMessageTime && (
                  <Text size="xs" className={styles.roomMeta}>
                    {formatLastMessageTime(room.lastMessageTime)}
                  </Text>
                )}
              </Group>
              <Text size="xs" className={styles.roomMeta} truncate>
                {room.lastMessageSender
                  ? `${room.lastMessageSender}: ${room.lastMessage}`
                  : 'No messages yet'}
              </Text>
            </div>
            {room.unreadCount > 0 && (
              <div className={styles.roomUnread}>{room.unreadCount}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatRoomListThemed;
