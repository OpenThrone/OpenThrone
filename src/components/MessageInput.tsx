import { faPaperclip, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Box,
  CloseButton,
  Group,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import React, { useCallback, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { useUser } from '@/context/users';
import type { ChatMessage } from '@/types/typings';

interface MessageInputProps {
  selectedRoomId: number | null;
  socket: Socket | null;
  isConnected: boolean;
  replyingToMessage: ChatMessage | null;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  setIsShareModalOpen: (isOpen: boolean) => void;
  canWrite: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  selectedRoomId,
  socket,
  isConnected,
  replyingToMessage,
  setReplyingToMessage,
  setIsShareModalOpen,
  canWrite,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const { user, markRoomAsRead } = useUser();
  const currentUserId = user?.id;

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!selectedRoomId || !content.trim() || !socket || !isConnected) return;
      socket.emit('sendMessage', {
        roomId: selectedRoomId,
        content: content.trim(),
        replyToMessageId: replyingToMessage?.id,
      });
      markRoomAsRead(selectedRoomId);
      setReplyingToMessage(null);
      setNewMessage('');
    },
    [
      selectedRoomId,
      socket,
      isConnected,
      replyingToMessage,
      setReplyingToMessage,
      markRoomAsRead,
    ],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(newMessage);
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      p="md"
      style={(theme) => ({ borderTop: `1px solid ${theme.colors.dark[4]}` })}
    >
      {replyingToMessage && (
        <Box
          p="xs"
          mb="xs"
          bg="dark.6"
          style={{ borderRadius: 'var(--mantine-radius-sm)' }}
        >
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed">
                Replying to {replyingToMessage.sender.display_name}
              </Text>
              <Text size="sm" lineClamp={1}>
                {replyingToMessage.content}
              </Text>
            </div>
            <CloseButton size="sm" onClick={() => setReplyingToMessage(null)} />
          </Group>
        </Box>
      )}
      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Share Attack Log">
          <ActionIcon
            variant="subtle"
            onClick={() => setIsShareModalOpen(true)}
            size="lg"
            disabled={!canWrite}
          >
            <FontAwesomeIcon icon={faPaperclip} />
          </ActionIcon>
        </Tooltip>
        <TextInput
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          style={{ flex: 1 }}
          disabled={!canWrite}
          rightSection={
            <ActionIcon
              type="submit"
              variant="filled"
              color="blue"
              size="lg"
              disabled={!newMessage.trim() || !canWrite}
            >
              <FontAwesomeIcon icon={faPaperPlane} />
            </ActionIcon>
          }
        />
      </Group>
    </Box>
  );
};

export default MessageInput;
