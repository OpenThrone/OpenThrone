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
  ScrollArea,
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
import NewMessageModal from '@/components/NewMessageModal';
import { useUser } from '@/context/users';
import useSocket from '@/hooks/useSocket';
import { alertService } from '@/services/Alert.service';
import type { ChatMessage, FrontendRoom } from '@/types/typings';
import { logError, logInfo } from '@/utils/logger';

import ChatMessageGroupThemed from './ChatMessageGroupThemed';
import ChatMessageInputThemed from './ChatMessageInputThemed';
import styles from './ChatThemed.module.css';

interface ChatMessageListThemedProps {
  selectedRoomId: number | null;
  messages: ChatMessage[];
  isLoading: boolean;
  roomInfo?: FrontendRoom | null;
}

const ChatMessageListThemed: React.FC<ChatMessageListThemedProps> = ({
  selectedRoomId,
  messages,
  roomInfo,
  isLoading,
}) => {
  const { t } = useTranslation('messaging');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const [prevMessages, setPrevMessages] = useState(messages);
  if (messages !== prevMessages) {
    setPrevMessages(messages);
    setChatMessages(messages);
  }
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user, markRoomAsRead } = useUser();
  const currentUserId = user?.id;
  const {
    socket,
    isConnected,
    emitAddReaction,
    emitRemoveReaction,
    emitMarkAsRead,
  } = useSocket(user?.id);

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isCreatingGroupFromDM, setIsCreatingGroupFromDM] = useState(false);
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

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

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

    const markedRef = messagesMarkedAsRead.current;
    return () => {
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
      return;
    }
    logInfo(
      `Emitting sendMessage to share attack log ${logId} in room ${selectedRoomId}`,
    );
    socket.emit('sendMessage', {
      roomId: selectedRoomId,
      content: `Shared Attack Log #${logId}`,
      messageType: 'ATTACK_LOG_SHARE',
      sharedAttackLogId: logId,
    });
    setIsShareModalOpen(false);
    markRoomAsRead(selectedRoomId);
  };

  const groupedMessages = useMemo(() => {
    const groups: ChatMessage[][] = [];
    let currentGroup: ChatMessage[] = [];
    chatMessages.forEach((message, index) => {
      const previousMessage = chatMessages[index - 1];
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
      if (isSameSender && withinTimeThreshold) {
        currentGroup.push(message);
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [message];
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }, [chatMessages]);

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
      return message.content;
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
        {groupedMessages.map((group, idx) => (
          <ChatMessageGroupThemed
            key={`group-${idx}`}
            group={group}
            isCurrentUser={group[0].senderId === currentUserId}
            currentUserId={currentUserId}
            handleToggleReaction={handleToggleReaction}
            setReplyingToMessage={setReplyingToMessage}
            renderMessageContent={renderMessageContent}
            messageElementRefs={messageElementRefs}
          />
        ))}
        <div ref={bottomRef} />
      </Stack>
    );
  }, [
    isLoading,
    groupedMessages,
    currentUserId,
    handleToggleReaction,
    setReplyingToMessage,
    renderMessageContent,
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
      <Paper p="md" className={styles.messagesHeader} withBorder={false}>
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
            {roomInfo?.isDirect && (
              <Tooltip label={t('conversation.createGroup')}>
                <ActionIcon
                  variant="subtle"
                  color="yellow"
                  aria-label={t('conversation.createGroup')}
                  onClick={() => {
                    setIsCreatingGroupFromDM(true);
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
                      setIsCreatingGroupFromDM(false);
                      setIsAddUserModalOpen(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faUserPlus} />
                  </ActionIcon>
                </Tooltip>
              )}
            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="yellow"
                  aria-label={t('conversation.options')}
                >
                  <FontAwesomeIcon icon={faEllipsisV} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {roomInfo?.isAdmin && !roomInfo.isDirect && (
                  <>
                    <Menu.Label>
                      {t('conversation.menu.adminControls')}
                    </Menu.Label>
                    <Menu.Item
                      onClick={() => setIsManageMembersModalOpen(true)}
                    >
                      {t('conversation.menu.manageMembers')}
                    </Menu.Item>
                    <Menu.Item>
                      {t('conversation.menu.editGroupInfo')}
                    </Menu.Item>
                    <Menu.Divider />
                  </>
                )}
                <Menu.Item>{t('conversation.menu.searchMessages')}</Menu.Item>
                <Menu.Item>
                  {t('conversation.menu.muteNotifications')}
                </Menu.Item>
                {roomInfo?.isAdmin && !roomInfo.isDirect && (
                  <Menu.Item color="red">
                    {t('conversation.menu.deleteGroup')}
                  </Menu.Item>
                )}
                {roomInfo?.isDirect && (
                  <Menu.Item color="red">
                    {t('conversation.menu.deleteConversation')}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>
      </Paper>

      <div className="flex-1 overflow-hidden">
        <ScrollArea
          viewportRef={scrollViewportRef}
          className={styles.messageArea}
          type="auto"
        >
          {renderedMessageArea}
        </ScrollArea>
      </div>

      <ChatMessageInputThemed
        selectedRoomId={selectedRoomId}
        socket={socket}
        isConnected={isConnected}
        currentUserId={currentUserId}
        markRoomAsRead={markRoomAsRead}
        replyingToMessage={replyingToMessage}
        setReplyingToMessage={setReplyingToMessage}
        setIsShareModalOpen={setIsShareModalOpen}
        canWrite={
          roomInfo?.participants?.find((p) => p.id === currentUserId)
            ?.canWrite ?? false
        }
      />

      <NewMessageModal
        opened={isAddUserModalOpen}
        onClose={() => {
          setIsAddUserModalOpen(false);
          setIsCreatingGroupFromDM(false);
        }}
        existingChatId={isCreatingGroupFromDM ? undefined : selectedRoomId}
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
