import { Avatar, Badge, Box, Group, Stack, Text } from '@mantine/core';
import React from 'react';

import { formatLastMessageTime } from '@/utils/timefunctions';

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

const ChatRoomList: React.FC<ChatRoomListProps> = ({
  rooms,
  selectedRoomId = null,
  onRoomSelect,
}) => {
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
                  {room.name || `Direct Message`}
                </Text>
                {room.lastMessageTime && (
                  <Text size="xs" c="dimmed">
                    {formatLastMessageTime(room.lastMessageTime)}
                  </Text>
                )}
              </Group>
              <Text size="xs" c="dimmed" truncate>
                {room.lastMessageSender
                  ? `${room.lastMessageSender}: ${room.lastMessage}`
                  : 'No messages yet'}
              </Text>
            </div>
            {room.unreadCount > 0 && (
              <Badge color="yellow" variant="filled" size="sm">
                {room.unreadCount}
              </Badge>
            )}
          </Group>
        </Box>
      ))}
    </Stack>
  );
};

export default ChatRoomList;
