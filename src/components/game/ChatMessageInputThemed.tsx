import { faPaperclip, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Box,
  Button,
  CloseButton,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import ChatRichComposer from '@/components/game/ChatRichComposer';
import type { ChatDraft } from '@/types/chat';
import type { ChatMessage } from '@/types/typings';
import { CHAT_MAX_LENGTH } from '@/utils/chatContent';

import styles from './ChatThemed.module.css';

interface ChatMessageInputThemedProps {
  selectedRoomId: number | null;
  isConnected: boolean;
  onSendMessage: (draft: ChatDraft) => boolean;
  replyingToMessage: ChatMessage | null;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  setIsShareModalOpen: (isOpen: boolean) => void;
  canWrite: boolean;
  onTyping?: (isTyping: boolean) => void;
}

const ChatMessageInputThemed: React.FC<ChatMessageInputThemedProps> = ({
  selectedRoomId,
  isConnected,
  onSendMessage,
  replyingToMessage,
  setReplyingToMessage,
  setIsShareModalOpen,
  canWrite,
  onTyping,
}) => {
  const { t } = useTranslation('messaging');
  const [drafts, setDrafts] = useState<Record<number, ChatDraft>>({});
  const [sendError, setSendError] = useState(false);
  const draft = drafts[selectedRoomId] ?? { content: '' };
  useEffect(() => {
    setReplyingToMessage(null);
    setSendError(false);
  }, [selectedRoomId, setReplyingToMessage]);
  const handleSendMessage = useCallback(() => {
    if (
      !selectedRoomId ||
      !draft.content.trim() ||
      draft.content.length > CHAT_MAX_LENGTH ||
      !canWrite ||
      !isConnected
    )
      return;
    const accepted = onSendMessage({
      ...draft,
      replyToMessage: replyingToMessage,
    });
    if (!accepted) {
      setSendError(true);
      return;
    }
    setSendError(false);
    onTyping?.(false);
    setReplyingToMessage(null);
    setDrafts((previous) => ({
      ...previous,
      [selectedRoomId]: { content: '' },
    }));
  }, [
    selectedRoomId,
    draft,
    canWrite,
    isConnected,
    onSendMessage,
    replyingToMessage,
    setReplyingToMessage,
    onTyping,
  ]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSendMessage();
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          onTyping?.(false);
      }}
      className={styles.inputPanel}
      p="md"
      radius={0}
      styles={{
        root: {
          background: 'var(--ot-surface)',
          border: 0,
          borderTop: '1px solid var(--ot-line)',
          boxShadow: 'none',
        },
      }}
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
      <ChatRichComposer
        key={selectedRoomId}
        value={draft.richContent}
        focusKey={replyingToMessage?.id}
        disabled={!canWrite}
        label={
          replyingToMessage
            ? t('input.replyPlaceholder')
            : t('input.placeholder')
        }
        onSend={handleSendMessage}
        onChange={(content, richContent) => {
          setSendError(false);
          onTyping?.(Boolean(content.trim()));
          if (selectedRoomId)
            setDrafts((previous) => ({
              ...previous,
              [selectedRoomId]: { content, richContent },
            }));
        }}
      />
      <Group justify="space-between" gap="xs" mt="xs">
        <Group gap="xs">
          <Button
            type="button"
            variant="subtle"
            size="compact-sm"
            onClick={() => setIsShareModalOpen(true)}
            disabled={!canWrite || !selectedRoomId}
            leftSection={<FontAwesomeIcon icon={faPaperclip} />}
          >
            {t('input.shareAttackLog')}
          </Button>
          <Text
            size="xs"
            c={
              draft.content.length > CHAT_MAX_LENGTH ? 'red' : 'var(--ot-muted)'
            }
            aria-live="polite"
          >
            {draft.content.length.toLocaleString()} /{' '}
            {CHAT_MAX_LENGTH.toLocaleString()}
          </Text>
        </Group>
        <Tooltip label={t('input.send')}>
          <ActionIcon
            type="submit"
            size="lg"
            disabled={
              !draft.content.trim() ||
              draft.content.length > CHAT_MAX_LENGTH ||
              !canWrite ||
              !isConnected ||
              !selectedRoomId
            }
            className={styles.sendButton}
            aria-label={t('input.send')}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {sendError && (
        <Text size="xs" c="red" role="alert">
          {t('input.invalidContent')}
        </Text>
      )}
      <Stack gap={2} mt={6}>
        <Text size="xs" c="var(--ot-muted)">
          {t('input.keyboardHint')}
        </Text>
        {!isConnected && (
          <Text size="xs" c="var(--ot-muted)" role="status">
            {t('input.offline')}
          </Text>
        )}
      </Stack>
    </Paper>
  );
};

export default ChatMessageInputThemed;
