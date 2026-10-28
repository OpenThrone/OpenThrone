import { Avatar, Group, Text, UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useTranslation } from 'next-i18next';
import React from 'react';

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

const formatRoomTime = (value: string, locale: string) => {
  const date = new Date(value);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale);
};

const ChatRoomListThemed: React.FC<ChatRoomListThemedProps> = ({
  rooms,
  selectedRoomId = null,
  onRoomSelect,
  title,
}) => {
  const { t, i18n } = useTranslation('messaging');

  return (
    <div className={styles.roomSidebar}>
      <div className={styles.panelHeader}>
        <Text className={styles.panelTitle}>{title ?? t('rooms.heading')}</Text>
        <Text size="xs" className={styles.roomMeta}>
          {t('rooms.count', { count: rooms.length })}
        </Text>
      </div>
      <div className={styles.roomList}>
        {rooms.map((room) => (
          <UnstyledButton
            key={room.id}
            className={clsx(
              styles.roomItem,
              selectedRoomId === room.id && styles.roomItemActive,
            )}
            onClick={() => onRoomSelect(room.id)}
            aria-pressed={selectedRoomId === room.id}
          >
            <Avatar src={room.image || undefined} size={40} radius="xl">
              {room.name
                ? room.name[0]?.toUpperCase()
                : room.isDirect
                  ? 'U'
                  : 'G'}
            </Avatar>
            <div className={styles.roomContent}>
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm" className={styles.roomTitle} truncate>
                  {room.name || t('rooms.directMessage')}
                </Text>
                {room.lastMessageTime && (
                  <Text size="xs" className={styles.roomMeta}>
                    {formatRoomTime(room.lastMessageTime, i18n.language)}
                  </Text>
                )}
              </Group>
              <Text size="xs" className={styles.roomMeta} truncate>
                {room.lastMessageSender
                  ? t('rooms.lastMessage', {
                      sender: room.lastMessageSender,
                      message: room.lastMessage,
                    })
                  : t('rooms.noMessagesYet')}
              </Text>
            </div>
            {room.unreadCount > 0 && (
              <div
                className={styles.roomUnread}
                aria-label={t('rooms.unread', { count: room.unreadCount })}
              >
                {room.unreadCount.toLocaleString(i18n.language)}
              </div>
            )}
          </UnstyledButton>
        ))}
      </div>
    </div>
  );
};

export default ChatRoomListThemed;
