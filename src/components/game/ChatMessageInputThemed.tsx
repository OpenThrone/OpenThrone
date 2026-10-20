import { faPaperclip, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Box,
  CloseButton,
  Group,
  Paper,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type { ChatMessage } from '@/types/typings';
import { logInfo } from '@/utils/logger';

import styles from './ChatThemed.module.css';

interface ChatMessageInputThemedProps {
  selectedRoomId: number | null;
  socket: Socket | null;
  isConnected: boolean;
  currentUserId: number | undefined;
  markRoomAsRead: (roomId: number) => void;
  replyingToMessage: ChatMessage | null;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  setIsShareModalOpen: (isOpen: boolean) => void;
  canWrite: boolean;
}

const ChatMessageInputThemed: React.FC<ChatMessageInputThemedProps> = ({
  selectedRoomId,
  socket,
  isConnected,
  currentUserId,
  markRoomAsRead,
  replyingToMessage,
  setReplyingToMessage,
  setIsShareModalOpen,
  canWrite,
}) => {
  const { t } = useTranslation('messaging');
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = useCallback(
    (content: string) => {
      if (
        !selectedRoomId ||
        !content.trim() ||
        !socket ||
        !isConnected ||
        !currentUserId
      ) {
        return;
      }

      const messageContent = content.trim();
      logInfo(
        `ChatMessageInputThemed: Emitting sendMessage for room ${selectedRoomId}`,
      );

      socket.emit('sendMessage', {
        roomId: selectedRoomId,
        content: messageContent,
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
      currentUserId,
      markRoomAsRead,
      replyingToMessage,
      setReplyingToMessage,
    ],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSendMessage(newMessage);
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      className={styles.inputPanel}
      p="md"
      radius={0}
      shadow="sm"
    >
      {replyingToMessage && (
        <Box
          p="xs"
          mb="xs"
          className={styles.inputReply}
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
              title={t('input.cancelReply')}
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
          placeholder={
            replyingToMessage
              ? t('input.replyPlaceholder')
              : t('input.placeholder')
          }
          aria-label={
            replyingToMessage
              ? t('input.replyPlaceholder')
              : t('input.placeholder')
          }
          value={newMessage}
          onChange={(event) => setNewMessage(event.target.value)}
          className="flex-1"
          disabled={!canWrite}
          rightSection={
            <ActionIcon
              type="submit"
              size="lg"
              disabled={!newMessage.trim() || !canWrite}
              className={styles.sendButton}
              aria-label={t('input.send')}
            >
              <FontAwesomeIcon icon={faPaperPlane} />
            </ActionIcon>
          }
          rightSectionWidth={46}
          styles={{
            input: {
              paddingRight: 46,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(234, 174, 43, 0.25)',
              color: '#f6e9bf',
              fontFamily: 'MedievalSharp, serif',
            },
            section: {
              paddingRight: 4,
            },
          }}
        />
      </Group>
    </Paper>
  );
};

export default ChatMessageInputThemed;
