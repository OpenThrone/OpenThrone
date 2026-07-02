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
      !emitMarkAsRead
    )
      return;
    if (observerRef.current) {
      observerRef.current.disconnect();
      messagesMarkedAsRead.current.clear();
    }

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      const messagesToMark: number[] = [];
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
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

    observerRef.current = new IntersectionObserver(observerCallback, {
      root: scrollViewportRef.current,
      threshold: 0.8,
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
  }, [chatMessages, selectedRoomId, currentUserId, emitMarkAsRead]);

  const handleShareAttackLog = async (logId: number) => {
    if (!selectedRoomId || !socket || !isConnected || !currentUserId) {
      alertService.error('Cannot share log.');
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
        alertService.success(`Action '${action}' completed.`);
        setIsManageMembersModalOpen(false);
      } else {
        const errorData = await response.json();
        alertService.error(`Failed: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      logError('Error managing member:', error);
      alertService.error(`Error: ${action} member.`);
    } finally {
      setIsMemberActionLoading(false);
    }
  };

  const renderMessageContent = useCallback((message: ChatMessage) => {
    if (message.messageType === 'ATTACK_LOG_SHARE' && message.sharedAttackLog) {
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
            View Attack Log #{logId}
          </Button>
        </Link>
      );
    }
    return message.content;
  }, []);

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
            No messages yet.
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
  ]);

  if (!selectedRoomId) {
    return (
      <Center className="h-full flex-col">
        <FontAwesomeIcon icon={faComment} size="4x" color="#6b7280" />
        <Title order={3} c="dimmed" mt="md">
          Select a conversation
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
                {roomInfo?.name || 'Chat'}
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
                    ? 'Online'
                    : 'Offline'}
                </Text>
              )}
              {!roomInfo?.isDirect && (
                <Text size="xs" c="dimmed">
                  {roomInfo?.participants?.length || 0} members ·{' '}
                  {roomInfo?.isPrivate ? 'Private' : 'Public'}
                </Text>
              )}
            </div>
          </Group>
          <Group gap="xs">
            {roomInfo?.isDirect && (
              <Tooltip label="Create group chat">
                <ActionIcon
                  variant="subtle"
                  color="yellow"
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
                <Tooltip label="Add members">
                  <ActionIcon
                    variant="subtle"
                    color="yellow"
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
                <ActionIcon variant="subtle" color="yellow">
                  <FontAwesomeIcon icon={faEllipsisV} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {roomInfo?.isAdmin && !roomInfo.isDirect && (
                  <>
                    <Menu.Label>Admin Controls</Menu.Label>
                    <Menu.Item
                      onClick={() => setIsManageMembersModalOpen(true)}
                    >
                      Manage members
                    </Menu.Item>
                    <Menu.Item>Edit group info</Menu.Item>
                    <Menu.Divider />
                  </>
                )}
                <Menu.Item>Search messages</Menu.Item>
                <Menu.Item>Mute notifications</Menu.Item>
                {roomInfo?.isAdmin && !roomInfo.isDirect && (
                  <Menu.Item color="red">Delete group</Menu.Item>
                )}
                {roomInfo?.isDirect && (
                  <Menu.Item color="red">Delete conversation</Menu.Item>
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
        title="Manage Group Members"
        size="lg"
      >
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Member</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Can Write</Table.Th>
              <Table.Th>Actions</Table.Th>
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
                      {participant.id === currentUserId ? '(You)' : ''}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={participant.role === 'ADMIN' ? 'yellow' : 'gray'}
                  >
                    {participant.role}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
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
                            <Tooltip label="Make admin">
                              <ActionIcon
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
                            <Tooltip label="Remove admin">
                              <ActionIcon
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
                          <Tooltip label="Remove from group">
                            <ActionIcon
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
