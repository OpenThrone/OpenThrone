import {
  faComment,
  faCommentSlash,
  faEllipsisV,
  faTrash,
  faUserPlus,
  faUserShield,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Center,
  Group,
  Menu,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import AttackLogShareModal from '@/components/AttackLogShareModal';
import ChatMessageBody from '@/components/game/ChatMessageBody';
import ChatTimeline from '@/components/game/ChatTimeline';
import NewMessageModal from '@/components/NewMessageModal';
import { useUser } from '@/context/users';
import { useChatOutbox } from '@/hooks/useChatOutbox';
import useChatTyping from '@/hooks/useChatTyping';
import useSocket from '@/hooks/useSocket';
import { alertService } from '@/services/Alert.service';
import type { ChatMessage, FrontendRoom } from '@/types/typings';
import { mergeChatMessages } from '@/utils/chatDelivery';
import { logError, logInfo } from '@/utils/logger';

import ChatMembersPopover from './ChatMembersPopover';
import ChatMessageGroupThemed from './ChatMessageGroupThemed';
import ChatMessageInputThemed from './ChatMessageInputThemed';
import styles from './ChatThemed.module.css';

interface ChatMessageListThemedProps {
  selectedRoomId: number | null;
  messages: ChatMessage[];
  isLoading: boolean;
  roomInfo?: FrontendRoom | null;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onJumpToMessage?: (messageId: number) => void;
  onSentFromHistory?: () => void;
}

const ChatMessageListThemed: React.FC<ChatMessageListThemedProps> = ({
  selectedRoomId,
  messages,
  roomInfo,
  isLoading,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onJumpToMessage,
  onSentFromHistory,
}) => {
  const { t } = useTranslation('messaging');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const [prevMessages, setPrevMessages] = useState(messages);
  if (messages !== prevMessages) {
    setPrevMessages(messages);
    setChatMessages(messages);
  }
  const { user } = useUser();
  const currentUserId = user?.id;
  const {
    socket,
    isConnected,
    emitAddReaction,
    emitRemoveReaction,
    emitMarkAsRead,
  } = useSocket(user?.id);
  const { typingNames, onTyping } = useChatTyping(
    socket,
    selectedRoomId,
    currentUserId ?? null,
    Boolean(isConnected),
  );

  const sender = useMemo(
    () =>
      user
        ? {
            id: user.id,
            display_name: user.displayName,
            avatar: user.avatar,
            is_online: true,
          }
        : undefined,
    [user?.id, user?.displayName, user?.avatar],
  );
  const { outbox, send, retry } = useChatOutbox({
    socket,
    isConnected,
    sender,
    messages,
  });
  const timelineMessages = useMemo(
    () => mergeChatMessages(chatMessages, outbox, selectedRoomId),
    [chatMessages, outbox, selectedRoomId],
  );
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] =
    useState(false);
  const [isMemberActionLoading, setIsMemberActionLoading] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [replyingToMessage, setReplyingToMessage] =
    useState<ChatMessage | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messageElementRefs = useRef<Map<number, HTMLElement>>(new Map());
  const messagesMarkedAsRead = useRef<Set<number>>(new Set());
  const unreadSnapshotRoom = useRef<number | null>(null);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<
    number | null
  >(null);
  const pendingJumpId = useRef<number | null>(null);

  const scrollToMessage = useCallback((element: HTMLElement) => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    const elementRect = element.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const nextScrollTop =
      viewport.scrollTop +
      elementRect.top -
      viewportRect.top -
      viewport.clientHeight / 2 +
      element.clientHeight / 2;
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    viewport.scrollTo({
      top: nextScrollTop,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
    element.setAttribute('data-highlight', 'true');
    window.setTimeout(() => element.removeAttribute('data-highlight'), 1600);
    element.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!selectedRoomId || !currentUserId || isLoading || !messages.length)
      return;
    if (unreadSnapshotRoom.current === selectedRoomId) return;
    unreadSnapshotRoom.current = selectedRoomId;
    const firstUnread = messages.find(
      (message) =>
        message.senderId !== currentUserId &&
        !message.readBy?.some((reader) => reader.userId === currentUserId),
    );
    setFirstUnreadMessageId(firstUnread?.id ?? null);
  }, [currentUserId, isLoading, messages, selectedRoomId]);

  useEffect(() => {
    pendingJumpId.current = null;
  }, [selectedRoomId]);

  const handleJumpToMessage = useCallback(
    (messageId: number) => {
      const element = document.getElementById(`chat-message-${messageId}`);
      if (element) {
        pendingJumpId.current = null;
        scrollToMessage(element);
        return;
      }
      pendingJumpId.current = messageId;
      onJumpToMessage?.(messageId);
    },
    [onJumpToMessage, scrollToMessage],
  );

  useEffect(() => {
    if (pendingJumpId.current === null) return;
    const target = document.getElementById(
      `chat-message-${pendingJumpId.current}`,
    );
    if (!target) return;
    pendingJumpId.current = null;
    scrollToMessage(target);
  }, [scrollToMessage, timelineMessages]);

  useEffect(() => {
    if (
      !scrollViewportRef.current ||
      !selectedRoomId ||
      !currentUserId ||
      !emitMarkAsRead ||
      !isConnected
    )
      return;
    if (observerRef.current) {
      observerRef.current.disconnect();
      messagesMarkedAsRead.current.clear();
    }

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      if (document.visibilityState !== 'visible') return;
      const messagesToMark: number[] = [];
      entries.forEach((entry) => {
        if (
          !entry.isIntersecting ||
          entry.intersectionRect.height + 1 <
            Math.min(48, entry.boundingClientRect.height)
        )
          return;
        const targetElement = entry.target as HTMLElement;
        const messageIdStr = targetElement.dataset.messageId;
        if (!messageIdStr) return;
        const messageId = parseInt(messageIdStr, 10);
        if (messagesMarkedAsRead.current.has(messageId)) return;
        messagesToMark.push(messageId);
        messagesMarkedAsRead.current.add(messageId);
        observerRef.current?.unobserve(targetElement);
      });
      if (messagesToMark.length > 0) {
        logInfo(
          `Emitting markAsRead for messages: ${messagesToMark.join(', ')} in room ${selectedRoomId}`,
        );
        emitMarkAsRead({ messageIds: messagesToMark, roomId: selectedRoomId });
      }
    };

    const visibilityThresholds = [...messageElementRefs.current.values()].map(
      (element) => {
        const { height } = element.getBoundingClientRect();
        return height > 0 ? Math.min(48, height) / height : 1;
      },
    );
    observerRef.current = new IntersectionObserver(observerCallback, {
      root: scrollViewportRef.current,
      threshold: [...new Set([0, 1, ...visibilityThresholds])].sort(
        (a, b) => a - b,
      ),
    });

    messageElementRefs.current.forEach((element, messageId) => {
      const message = chatMessages.find((msg) => msg.id === messageId);
      if (!message || message.senderId === currentUserId) return;
      const alreadyReadByCurrentUser = message.readBy?.some(
        (reader) => reader.userId === currentUserId,
      );
      if (!alreadyReadByCurrentUser) {
        observerRef.current?.observe(element);
      }
    });

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      observerRef.current?.disconnect();
      messageElementRefs.current.forEach((element) =>
        observerRef.current?.observe(element),
      );
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const markedRef = messagesMarkedAsRead.current;
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
        markedRef.clear();
      }
    };
  }, [
    chatMessages,
    selectedRoomId,
    currentUserId,
    emitMarkAsRead,
    isConnected,
  ]);

  const handleShareAttackLog = async (logId: number) => {
    if (!selectedRoomId || !socket || !isConnected || !currentUserId) {
      alertService.error(t('share.cannotShare'));
      return false;
    }
    const accepted = send(selectedRoomId, {
      content: t('message.sharedAttackLog', { id: logId }),
      messageType: 'ATTACK_LOG_SHARE',
      sharedAttackLogId: logId,
      replyToMessage: replyingToMessage,
    });
    if (accepted) {
      onSentFromHistory?.();
      setIsShareModalOpen(false);
      setReplyingToMessage(null);
    }
    return accepted;
  };

  const groupedMessages = useMemo(() => {
    const groups: ChatMessage[][] = [];
    let currentGroup: ChatMessage[] = [];
    timelineMessages.forEach((message, index) => {
      const previousMessage = timelineMessages[index - 1];
      const isSameSender = previousMessage?.senderId === message.senderId;
      const currentSentAt = message.sentAt
        ? new Date(message.sentAt).getTime()
        : 0;
      const previousSentAt = previousMessage?.sentAt
        ? new Date(previousMessage.sentAt).getTime()
        : 0;
      const timeDiff =
        previousMessage && currentSentAt && previousSentAt
          ? currentSentAt - previousSentAt
          : Infinity;
      const withinTimeThreshold = timeDiff < 60000;
      if (
        isSameSender &&
        withinTimeThreshold &&
        !message.deliveryState &&
        !message.deletedAt &&
        !previousMessage?.deletedAt &&
        !previousMessage?.deliveryState
      ) {
        currentGroup.push(message);
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [message];
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }, [timelineMessages]);

  const handleToggleReaction = useCallback(
    (messageId: number, clickedReaction: string) => {
      if (!selectedRoomId || !currentUserId || !user?.displayName) return;
      const messageIndex = chatMessages.findIndex(
        (msg) => msg.id === messageId,
      );
      if (messageIndex === -1) return;
      const message = chatMessages[messageIndex];
      const currentUserExistingReaction = message.reactions?.find(
        (r) => r.userId === currentUserId,
      );
      const isTogglingSameReaction =
        currentUserExistingReaction?.reaction === clickedReaction;

      setChatMessages((currentMessages) => {
        const updatedMessages = [...currentMessages];
        const targetMessage = { ...updatedMessages[messageIndex] };
        targetMessage.reactions = [...(targetMessage.reactions || [])];
        if (currentUserExistingReaction) {
          targetMessage.reactions = targetMessage.reactions.filter(
            (r) => r.userId !== currentUserId,
          );
        }
        if (!isTogglingSameReaction) {
          targetMessage.reactions.push({
            userId: currentUserId,
            reaction: clickedReaction,
            userDisplayName: user.displayName,
          });
        }
        updatedMessages[messageIndex] = targetMessage;
        return updatedMessages;
      });

      if (currentUserExistingReaction) {
        emitRemoveReaction({
          messageId,
          reaction: currentUserExistingReaction.reaction,
          roomId: selectedRoomId,
        });
      }
      if (!isTogglingSameReaction) {
        emitAddReaction({
          messageId,
          reaction: clickedReaction,
          roomId: selectedRoomId,
        });
      }
    },
    [
      selectedRoomId,
      currentUserId,
      user?.displayName,
      chatMessages,
      emitAddReaction,
      emitRemoveReaction,
      setChatMessages,
    ],
  );

  const handleMemberAction = async (
    targetUserId: number,
    action: 'promote' | 'demote' | 'remove' | 'toggleWrite',
  ) => {
    if (!selectedRoomId || !roomInfo?.isAdmin) return;
    setIsMemberActionLoading(true);
    try {
      const targetParticipant = roomInfo?.participants?.find(
        (p) => p.id === targetUserId,
      );
      const currentCanWrite = targetParticipant?.canWrite;
      const response = await fetch(
        `/api/messages/${selectedRoomId}/participants/${targetUserId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: action === 'toggleWrite' ? 'updatePermissions' : action,
            ...(action === 'toggleWrite' && { canWrite: !currentCanWrite }),
          }),
        },
      );
      if (response.ok) {
        alertService.success(t(`members.actionSuccess.${action}`));
        setIsManageMembersModalOpen(false);
      } else {
        const errorData = await response.json();
        alertService.error(
          t('members.actionFailed', {
            message: errorData.message || t('members.unknownError'),
          }),
        );
      }
    } catch (error) {
      logError('Error managing member:', error);
      alertService.error(t('members.actionError'));
    } finally {
      setIsMemberActionLoading(false);
    }
  };

  const renderMessageContent = useCallback(
    (message: ChatMessage) => {
      if (message.deletedAt)
        return (
          <Text fs="italic" c="var(--ot-muted)" size="sm">
            {t('message.removed')}
          </Text>
        );
      if (
        message.messageType === 'ATTACK_LOG_SHARE' &&
        message.sharedAttackLog
      ) {
        const logId = message.sharedAttackLog.id;
        return (
          <Link href={`/battle/results/${logId}`} passHref legacyBehavior>
            <Button
              variant="outline"
              size="xs"
              component="a"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('message.viewAttackLog', { id: logId })}
            </Button>
          </Link>
        );
      }
      return (
        <ChatMessageBody
          content={message.content}
          richContent={message.richContent}
        />
      );
    },
    [t],
  );

  const renderedMessageArea = useMemo(() => {
    if (isLoading) {
      return (
        <Stack gap="md" px="md" py="lg">
          {[...Array(5)].map((_, i) => (
            <Paper key={i} p="md" shadow="xs" radius="md" withBorder>
              <Group>
                <Skeleton height={40} circle />
                <div style={{ flex: 1 }}>
                  <Skeleton height={10} width="30%" mb={10} />
                  <Skeleton height={10} width="80%" />
                </div>
              </Group>
            </Paper>
          ))}
        </Stack>
      );
    }
    if (groupedMessages.length === 0) {
      return (
        <Center className="h-full flex-col">
          <FontAwesomeIcon icon={faCommentSlash} size="3x" color="#6b7280" />
          <Text c="dimmed" mt="md">
            {t('conversation.empty')}
          </Text>
        </Center>
      );
    }
    return (
      <Stack gap="lg" py="md">
        {groupedMessages.map((group) => (
          <ChatMessageGroupThemed
            key={group[0].clientMessageId ?? group[0].id}
            group={group}
            isCurrentUser={group[0].senderId === currentUserId}
            currentUserId={currentUserId}
            handleToggleReaction={handleToggleReaction}
            setReplyingToMessage={setReplyingToMessage}
            renderMessageContent={renderMessageContent}
            messageElementRefs={messageElementRefs}
            onJumpToMessage={handleJumpToMessage}
            firstUnreadMessageId={firstUnreadMessageId}
            onRetry={retry}
            canRetry={
              isConnected &&
              (roomInfo?.participants?.find((p) => p.id === currentUserId)
                ?.canWrite ??
                false)
            }
          />
        ))}
      </Stack>
    );
  }, [
    isLoading,
    groupedMessages,
    currentUserId,
    handleToggleReaction,
    setReplyingToMessage,
    renderMessageContent,
    handleJumpToMessage,
    firstUnreadMessageId,
    retry,
    isConnected,
    roomInfo?.participants,
    t,
  ]);

  if (!selectedRoomId) {
    return (
      <Center className="h-full flex-col">
        <FontAwesomeIcon icon={faComment} size="4x" color="#6b7280" />
        <Title order={3} c="dimmed" mt="md">
          {t('conversation.selectPrompt')}
        </Title>
      </Center>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Paper
        p="md"
        className={styles.messagesHeader}
        styles={{
          root: {
            border: 0,
            borderBottom: '1px solid var(--ot-line)',
            boxShadow: 'none',
          },
        }}
        withBorder={false}
      >
        <div className="flex w-full items-center justify-between">
          <Group gap="xs">
            {roomInfo?.isDirect ? (
              <Avatar
                size="md"
                radius="xl"
                src={
                  roomInfo?.participants?.find((p) => p.id !== currentUserId)
                    ?.avatar
                }
              >
                {(
                  roomInfo?.participants
                    ?.find((p) => p.id !== currentUserId)
                    ?.display_name?.charAt(0) || '?'
                ).toUpperCase()}
              </Avatar>
            ) : (
              <Avatar size="md" radius="xl">
                {(roomInfo?.name?.charAt(0) || '?').toUpperCase()}
              </Avatar>
            )}
            <div>
              <Text fw={600} size="lg" className={styles.roomTitle}>
                {roomInfo?.name || t('conversation.fallbackName')}
              </Text>
              <Text size="xs" c="dimmed" role="status">
                {isConnected
                  ? t('conversation.connected')
                  : t('conversation.reconnecting')}
              </Text>
              {roomInfo?.isDirect && (
                <Text
                  size="xs"
                  c={
                    roomInfo?.participants?.find((p) => p.id !== currentUserId)
                      ?.is_online
                      ? 'teal'
                      : 'dimmed'
                  }
                >
                  {roomInfo?.participants?.find((p) => p.id !== currentUserId)
                    ?.is_online
                    ? t('conversation.online')
                    : t('conversation.offline')}
                </Text>
              )}
              {!roomInfo?.isDirect && (
                <Text size="xs" c="dimmed">
                  {t('conversation.summary', {
                    members: t('conversation.members', {
                      count: roomInfo?.participants?.length || 0,
                    }),
                    visibility: roomInfo?.isPrivate
                      ? t('conversation.private')
                      : t('conversation.public'),
                  })}
                </Text>
              )}
            </div>
          </Group>
          <Group gap="xs">
            {roomInfo && !roomInfo.isDirect && (
              <ChatMembersPopover
                key={roomInfo.id}
                participants={roomInfo.participants ?? []}
                currentUserId={currentUserId}
              />
            )}
            {roomInfo?.isDirect && (
              <Tooltip label={t('conversation.createGroup')}>
                <ActionIcon
                  variant="subtle"
                  color="yellow"
                  aria-label={t('conversation.createGroup')}
                  onClick={() => {
                    setIsAddUserModalOpen(true);
                  }}
                >
                  <FontAwesomeIcon icon={faUserPlus} />
                </ActionIcon>
              </Tooltip>
            )}
            {!roomInfo?.isDirect &&
              (roomInfo?.isAdmin || !roomInfo?.isPrivate) && (
                <Tooltip label={t('conversation.addMembers')}>
                  <ActionIcon
                    variant="subtle"
                    color="yellow"
                    aria-label={t('conversation.addMembers')}
                    onClick={() => {
                      setIsAddUserModalOpen(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faUserPlus} />
                  </ActionIcon>
                </Tooltip>
              )}
            {roomInfo?.isAdmin && !roomInfo.isDirect && (
              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('conversation.options')}
                  >
                    <FontAwesomeIcon icon={faEllipsisV} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setIsManageMembersModalOpen(true)}>
                    {t('conversation.menu.manageMembers')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </div>
      </Paper>

      <ChatTimeline
        roomId={selectedRoomId}
        messages={timelineMessages}
        currentUserId={currentUserId}
        viewportRef={scrollViewportRef}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={onLoadOlder}
        firstUnreadMessageId={firstUnreadMessageId}
      >
        {renderedMessageArea}
      </ChatTimeline>

      {typingNames.length > 0 && (
        <Text size="xs" c="dimmed" px="md" py={4} role="status">
          {typingNames.length <= 3
            ? t('conversation.typing', { names: typingNames.join(', ') })
            : t('conversation.typingSeveral', {
                names: typingNames.slice(0, 3).join(', '),
                count: typingNames.length - 3,
              })}
        </Text>
      )}

      <ChatMessageInputThemed
        selectedRoomId={selectedRoomId}
        isConnected={isConnected}
        onSendMessage={(draft) => {
          const accepted = send(selectedRoomId, draft);
          if (accepted) onSentFromHistory?.();
          return accepted;
        }}
        replyingToMessage={replyingToMessage}
        setReplyingToMessage={setReplyingToMessage}
        setIsShareModalOpen={setIsShareModalOpen}
        canWrite={
          roomInfo?.participants?.find((p) => p.id === currentUserId)
            ?.canWrite ?? false
        }
        onTyping={onTyping}
      />

      <NewMessageModal
        opened={isAddUserModalOpen}
        onClose={() => {
          setIsAddUserModalOpen(false);
        }}
        existingChatId={selectedRoomId}
        existingUsers={roomInfo?.participants?.map((p) => p.id)}
        isDirectMessage={roomInfo?.isDirect}
      />
      <AttackLogShareModal
        opened={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onShare={handleShareAttackLog}
      />
      <Modal
        opened={isManageMembersModalOpen}
        onClose={() => setIsManageMembersModalOpen(false)}
        title={t('members.title')}
        size="lg"
      >
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('members.member')}</Table.Th>
              <Table.Th>{t('members.role')}</Table.Th>
              <Table.Th>{t('members.canWrite')}</Table.Th>
              <Table.Th>{t('members.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {roomInfo?.participants?.map((participant) => (
              <Table.Tr key={participant.id}>
                <Table.Td>
                  <Group gap="xs">
                    <Avatar src={participant.avatar} size="sm" radius="xl">
                      {(participant.display_name || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </Avatar>
                    <Text>
                      {participant.display_name}{' '}
                      {participant.id === currentUserId
                        ? t('members.youSuffix')
                        : ''}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={participant.role === 'ADMIN' ? 'yellow' : 'gray'}
                  >
                    {t(`members.roles.${participant.role}`, {
                      defaultValue: participant.role,
                    })}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    aria-label={t('members.toggleWrite', {
                      name: participant.display_name,
                    })}
                    checked={participant.canWrite}
                    disabled={
                      participant.id === currentUserId || isMemberActionLoading
                    }
                    onChange={() =>
                      handleMemberAction(participant.id, 'toggleWrite')
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {participant.id !== currentUserId &&
                      participant.id !== roomInfo?.createdById && (
                        <>
                          {participant.role === 'MEMBER' ? (
                            <Tooltip label={t('members.makeAdmin')}>
                              <ActionIcon
                                aria-label={t('members.makeAdmin')}
                                color="yellow"
                                onClick={() =>
                                  handleMemberAction(participant.id, 'promote')
                                }
                                loading={isMemberActionLoading}
                              >
                                <FontAwesomeIcon icon={faUserShield} />
                              </ActionIcon>
                            </Tooltip>
                          ) : (
                            <Tooltip label={t('members.removeAdmin')}>
                              <ActionIcon
                                aria-label={t('members.removeAdmin')}
                                color="orange"
                                onClick={() =>
                                  handleMemberAction(participant.id, 'demote')
                                }
                                loading={isMemberActionLoading}
                              >
                                <FontAwesomeIcon icon={faUserSlash} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          <Tooltip label={t('members.removeFromGroup')}>
                            <ActionIcon
                              aria-label={t('members.removeFromGroup')}
                              color="red"
                              onClick={() =>
                                handleMemberAction(participant.id, 'remove')
                              }
                              loading={isMemberActionLoading}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </ActionIcon>
                          </Tooltip>
                        </>
                      )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
    </div>
  );
};

export default ChatMessageListThemed;
