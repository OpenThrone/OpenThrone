import { Avatar, Box, Group, Stack, Text } from '@mantine/core';
import React from 'react';

import { useUser } from '@/context/users';
import type { ChatMessage } from '@/types/typings';

interface ChatMessageGroupProps {
  group: ChatMessage[];
  isCurrentUser: boolean;
  currentUserId: number | undefined;
  handleToggleReaction: (messageId: number, reaction: string) => void;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  renderMessageContent: (message: ChatMessage) => React.ReactNode;
  messageElementRefs: React.MutableRefObject<Map<number, HTMLElement>>;
}

const ChatMessageGroupComponent: React.FC<ChatMessageGroupProps> = ({
  group,
  isCurrentUser,
  currentUserId,
  ...props
}) => {
  const lastMessage = group[group.length - 1];
  const { user } = useUser();

  return (
    <Group
      justify={isCurrentUser ? 'flex-end' : 'flex-start'}
      gap="xs"
      wrap="nowrap"
    >
      {!isCurrentUser && (
        <Avatar src={group[0].sender?.avatar} size="md" radius="xl">
          {(group[0].sender?.display_name || '?').charAt(0).toUpperCase()}
        </Avatar>
      )}
      <Box
        p="md"
        style={(theme) => ({
          backgroundColor: isCurrentUser
            ? theme.colors.blue[8]
            : theme.colors.dark[5],
          borderRadius: theme.radius.lg,
          maxWidth: '70%',
        })}
      >
        {!isCurrentUser && (
          <Text size="sm" fw={600} c="blue.3">
            {group[0]?.sender?.display_name}
          </Text>
        )}
        <Stack gap="xs">
          {group.map((message) => (
            <div key={message.id}>
              <Text color="white">{props.renderMessageContent(message)}</Text>
            </div>
          ))}
        </Stack>
      </Box>
      {isCurrentUser && (
        <Avatar src={user?.avatar} size="md" radius="xl">
          {(user?.displayName || 'Y').charAt(0).toUpperCase()}
        </Avatar>
      )}
    </Group>
  );
};

const ChatMessageGroup = React.memo(ChatMessageGroupComponent);
export default ChatMessageGroup;
