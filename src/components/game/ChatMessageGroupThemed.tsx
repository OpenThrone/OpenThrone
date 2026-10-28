import {
  faCheck,
  faCheckDouble,
  faComment,
  faSmile,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Avatar,
  Button,
  Divider,
  Group,
  Indicator,
  Paper,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import type { ChatMessage } from '@/types/typings';

import styles from './ChatThemed.module.css';

interface ChatMessageGroupThemedProps {
  group: ChatMessage[];
  isCurrentUser: boolean;
  currentUserId: number | undefined;
  handleToggleReaction: (messageId: number, reaction: string) => void;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  renderMessageContent: (message: ChatMessage) => React.ReactNode;
  onRetry?: (clientMessageId: string) => void;
  canRetry?: boolean;
  onJumpToMessage?: (messageId: number) => void;
  firstUnreadMessageId?: number | null;
  messageElementRefs: React.MutableRefObject<Map<number, HTMLElement>>;
}

const ChatMessageGroupThemedComponent: React.FC<
  ChatMessageGroupThemedProps
> = ({
  group,
  isCurrentUser,
  currentUserId,
  handleToggleReaction,
  setReplyingToMessage,
  renderMessageContent,
  messageElementRefs,
  onRetry,
  canRetry = true,
  onJumpToMessage,
  firstUnreadMessageId,
}) => {
  const { t, i18n } = useTranslation('messaging');
  const lastMessageInGroup = group[group.length - 1];
  const formatMessageTime = (value: string | Date | undefined) => {
    if (!value) return '';
    const date = new Date(value);
    const isToday = date.toDateString() === new Date().toDateString();
    return isToday
      ? date.toLocaleTimeString(i18n.language, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : date.toLocaleDateString(i18n.language);
  };

  return (
    <Group
      justify={isCurrentUser ? 'flex-end' : 'flex-start'}
      gap="xs"
      p="xs"
      align="flex-start"
    >
      {!isCurrentUser && (
        <Indicator
          color={group[0].sender?.is_online ? 'teal' : 'gray'}
          size={10}
          offset={7}
          position="bottom-end"
          withBorder
        >
          <Avatar
            src={group[0].sender?.avatar}
            size="md"
            radius="xl"
            alt={group[0].sender?.display_name || t('message.unknownUser')}
          >
            {(group[0].sender?.display_name || '?').charAt(0).toUpperCase()}
          </Avatar>
        </Indicator>
      )}
      <Paper
        className={`${styles.messageBubble} ${isCurrentUser ? styles.messageBubbleOutgoing : ''}`}
        styles={{
          root: {
            background: 'var(--chat-bubble-bg)',
            border: 0,
            boxShadow: 'none',
          },
        }}
        withBorder={false}
      >
        {!isCurrentUser && (
          <Text size="sm" mb={4} className={styles.messageSender}>
            {group[0]?.sender?.display_name || t('message.unknownUser')}
          </Text>
        )}
        <Stack gap={6}>
          {group.map((message) => {
            const messageRefCallback = (node: HTMLDivElement | null) => {
              if (node && message.senderId !== currentUserId) {
                messageElementRefs.current.set(message.id, node);
              } else {
                messageElementRefs.current.delete(message.id);
              }
            };
            return (
              <React.Fragment key={message.id}>
                {firstUnreadMessageId === message.id && (
                  <Divider
                    label={t('conversation.unreadDivider')}
                    labelPosition="center"
                    my="xs"
                  />
                )}
                <div
                  id={`chat-message-${message.id}`}
                  tabIndex={-1}
                  ref={messageRefCallback}
                  data-message-id={message.id}
                >
                  {message.replyToMessage && (
                    <UnstyledButton
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'start',
                      }}
                      disabled={
                        !onJumpToMessage ||
                        !message.replyToMessage.id ||
                        !message.replyToMessage.content
                      }
                      aria-label={
                        message.replyToMessage.content
                          ? t('message.jumpToOriginal')
                          : t('conversation.originalUnavailable')
                      }
                      title={
                        message.replyToMessage.content
                          ? undefined
                          : t('conversation.originalUnavailable')
                      }
                      onClick={() => {
                        if (message.replyToMessage) {
                          onJumpToMessage?.(message.replyToMessage.id);
                        }
                      }}
                    >
                      <Paper
                        p="xs"
                        mb="xs"
                        radius="sm"
                        className={styles.replyBlock}
                        styles={{
                          root: {
                            background: 'var(--ot-inset)',
                            border: 0,
                            borderInlineStart: '1px solid var(--ot-accent)',
                            boxShadow: 'none',
                          },
                        }}
                      >
                        <Text size="xs" c="dimmed">
                          {t('message.replyingTo', {
                            name: message.replyToMessage.sender.display_name,
                          })}
                        </Text>
                        <Text size="sm" lineClamp={2} fs="italic">
                          {message.replyToMessage.content ||
                            t('message.removed')}
                        </Text>
                      </Paper>
                    </UnstyledButton>
                  )}
                  <div className={styles.messageContent}>
                    {renderMessageContent(message)}
                  </div>
                  {message.deliveryState && (
                    <Group gap="xs" mt="xs" role="status">
                      <Text size="xs" c="var(--ot-muted)">
                        {message.deliveryState === 'pending'
                          ? t('message.pending')
                          : t(
                              `message.deliveryErrors.${message.deliveryError ?? 'unconfirmed'}`,
                            )}
                      </Text>
                      {message.deliveryState === 'failed' &&
                        onRetry &&
                        message.clientMessageId && (
                          <Button
                            variant="subtle"
                            size="compact-xs"
                            disabled={!canRetry}
                            onClick={() => onRetry(message.clientMessageId)}
                          >
                            {t('message.retry')}
                          </Button>
                        )}
                    </Group>
                  )}
                  {!message.deletedAt &&
                    message.reactions &&
                    message.reactions.length > 0 && (
                      <Group gap={4} mt={4} wrap="wrap">
                        {Object.entries(
                          message.reactions.reduce(
                            (acc, r) => {
                              acc[r.reaction] = (acc[r.reaction] || 0) + 1;
                              return acc;
                            },
                            {} as Record<string, number>,
                          ),
                        ).map(([reaction, count]) => {
                          const reactors = message.reactions
                            .filter((r) => r.reaction === reaction)
                            .map((r) =>
                              r.userId === currentUserId
                                ? t('message.you')
                                : r.userDisplayName,
                            )
                            .join(', ');
                          const isCurrentUserReaction = message.reactions.some(
                            (r) =>
                              r.userId === currentUserId &&
                              r.reaction === reaction,
                          );
                          return (
                            <Tooltip
                              key={reaction}
                              label={reactors}
                              position="top"
                              withArrow
                            >
                              <UnstyledButton
                                className={styles.reaction}
                                aria-pressed={isCurrentUserReaction}
                                aria-label={t('message.reactWith', {
                                  emoji: reaction,
                                })}
                                onClick={() =>
                                  handleToggleReaction(message.id, reaction)
                                }
                              >
                                {reaction} {count.toLocaleString(i18n.language)}
                              </UnstyledButton>
                            </Tooltip>
                          );
                        })}
                      </Group>
                    )}
                </div>
              </React.Fragment>
            );
          })}
        </Stack>
        <Group justify="space-between" align="center" mt={6} gap="xs">
          <Group gap={4} align="center">
            <Text size="xs" className={styles.messageTime}>
              {formatMessageTime(lastMessageInGroup?.sentAt)}
            </Text>
            {isCurrentUser &&
              !lastMessageInGroup.deliveryState &&
              (() => {
                const readers = (lastMessageInGroup.readBy || [])
                  .filter((r) => r.userId !== currentUserId)
                  .map((r) => r.userDisplayName || t('user', { id: r.userId }));
                const isReadByOthers = readers.length > 0;
                const readerNames = readers.slice(0, 3).join(', ');
                const readTooltipLabel = isReadByOthers
                  ? readers.length > 3
                    ? t('message.readByMore', {
                        names: readerNames,
                        count: readers.length - 3,
                      })
                    : t('message.readBy', { names: readerNames })
                  : t('message.sent');
                return (
                  <Tooltip label={readTooltipLabel} position="top" withArrow>
                    <span>
                      <FontAwesomeIcon
                        icon={isReadByOthers ? faCheckDouble : faCheck}
                        size="xs"
                        color={
                          isReadByOthers
                            ? 'var(--ot-heading)'
                            : 'var(--ot-muted)'
                        }
                      />
                    </span>
                  </Tooltip>
                );
              })()}
          </Group>
          {!lastMessageInGroup.deliveryState &&
            !lastMessageInGroup.deletedAt && (
              <Group gap={2} align="center" className={styles.messageActions}>
                <Tooltip label={t('message.reply')} position="top" withArrow>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={() => setReplyingToMessage(lastMessageInGroup)}
                    aria-label={t('message.reply')}
                  >
                    <FontAwesomeIcon icon={faComment} />
                  </ActionIcon>
                </Tooltip>
                <Popover
                  width={200}
                  position="bottom-end"
                  withArrow
                  shadow="md"
                >
                  <Popover.Target>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      aria-label={t('message.addReaction')}
                    >
                      <FontAwesomeIcon icon={faSmile} />
                    </ActionIcon>
                  </Popover.Target>
                  <Popover.Dropdown p="xs">
                    <SimpleGrid cols={6} spacing="xs">
                      {['👍', '❤️', '😂', '😮', '😢', '😠'].map((emoji) => {
                        const currentUserReaction =
                          lastMessageInGroup.reactions?.find(
                            (r) => r.userId === currentUserId,
                          );
                        const isSelected =
                          currentUserReaction?.reaction === emoji;
                        return (
                          <ActionIcon
                            key={emoji}
                            variant={isSelected ? 'light' : 'subtle'}
                            color={isSelected ? 'yellow' : 'gray'}
                            aria-label={t('message.reactWith', { emoji })}
                            aria-pressed={isSelected}
                            onClick={() =>
                              handleToggleReaction(lastMessageInGroup.id, emoji)
                            }
                          >
                            <Text size="lg">{emoji}</Text>
                          </ActionIcon>
                        );
                      })}
                    </SimpleGrid>
                  </Popover.Dropdown>
                </Popover>
              </Group>
            )}
        </Group>
      </Paper>
      {isCurrentUser && (
        <Indicator
          color={group[0].sender?.is_online ? 'teal' : 'gray'}
          size={10}
          offset={7}
          position="bottom-end"
          withBorder
        >
          <Avatar
            src={group[0].sender?.avatar}
            size="md"
            radius="xl"
            alt={t('message.you')}
          >
            {(group[0].sender?.display_name || 'Y').charAt(0).toUpperCase()}
          </Avatar>
        </Indicator>
      )}
    </Group>
  );
};

const ChatMessageGroupThemed = React.memo(ChatMessageGroupThemedComponent);
export default ChatMessageGroupThemed;
