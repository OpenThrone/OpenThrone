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
import { useTranslation } from 'next-i18next';
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
  const { t } = useTranslation('messaging');
  const [newMessage, setNewMessage] = useState('');
  const { markRoomAsRead } = useUser();

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
                {t('message.replyingTo', {
                  name: replyingToMessage.sender.display_name,
                })}
              </Text>
              <Text size="sm" lineClamp={1}>
                {replyingToMessage.content}
              </Text>
            </div>
            <CloseButton
              size="sm"
              onClick={() => setReplyingToMessage(null)}
              aria-label={t('input.cancelReply')}
            />
          </Group>
        </Box>
      )}
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={t('input.shareAttackLog')}>
          <ActionIcon
            variant="subtle"
            onClick={() => setIsShareModalOpen(true)}
            size="lg"
            disabled={!canWrite}
            aria-label={t('input.shareAttackLog')}
          >
            <FontAwesomeIcon icon={faPaperclip} />
          </ActionIcon>
        </Tooltip>
        <TextInput
          placeholder={t('input.placeholder')}
          aria-label={t('input.placeholder')}
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
              aria-label={t('input.send')}
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
