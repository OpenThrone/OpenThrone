import { Avatar, Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

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

interface ChatRoomListProps {
  rooms: RoomListItem[];
  selectedRoomId?: number | null;
  onRoomSelect: (roomId: number) => void;
}

const formatRoomTime = (value: string, locale: string) => {
  const date = new Date(value);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale);
};

const ChatRoomList: React.FC<ChatRoomListProps> = ({
  rooms,
  selectedRoomId = null,
  onRoomSelect,
}) => {
  const { t, i18n } = useTranslation('messaging');

  return (
    <Stack gap="xs">
      {rooms.map((room) => (
        <Box
          key={room.id}
          onClick={() => onRoomSelect(room.id)}
          p="sm"
          style={(theme) => ({
            backgroundColor:
              selectedRoomId === room.id
                ? theme.colors.dark[5]
                : theme.colors.dark[7],
            borderRadius: theme.radius.sm,
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: theme.colors.dark[6],
            },
          })}
        >
          <Group>
            <Avatar src={room.image} radius="xl">
              {room.name
                ? room.name[0]?.toUpperCase()
                : room.isDirect
                  ? 'U'
                  : 'G'}
            </Avatar>
            <div style={{ flex: 1 }}>
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  {room.name || t('rooms.directMessage')}
                </Text>
                {room.lastMessageTime && (
                  <Text size="xs" c="dimmed">
                    {formatRoomTime(room.lastMessageTime, i18n.language)}
                  </Text>
                )}
              </Group>
              <Text size="xs" c="dimmed" truncate>
                {room.lastMessageSender
                  ? t('rooms.lastMessage', {
                      sender: room.lastMessageSender,
                      message: room.lastMessage,
                    })
                  : t('rooms.noMessagesYet')}
              </Text>
            </div>
            {room.unreadCount > 0 && (
              <Badge
                color="yellow"
                variant="filled"
                size="sm"
                aria-label={t('rooms.unread', { count: room.unreadCount })}
              >
                {room.unreadCount.toLocaleString(i18n.language)}
              </Badge>
            )}
          </Group>
        </Box>
      ))}
    </Stack>
  );
};

export default ChatRoomList;
