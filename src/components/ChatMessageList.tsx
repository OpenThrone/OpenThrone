import { useUser } from '@/context/users';
import {
  faComment, faCommentSlash, faEllipsisV, faTrash, faUserPlus,
  faUserShield, faUserSlash
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ScrollArea, Avatar, Text, Center, Title, ActionIcon, Group, Paper,
  Skeleton, Stack, Menu, Tooltip, Badge, Modal, Switch, Table, Button
} from '@mantine/core';
import NewMessageModal from '@/components/NewMessageModal';
import AttackLogShareModal from '@/components/AttackLogShareModal';
import MessageInput from './MessageInput';
import ChatMessageGroup from './ChatMessageGroup';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useSocket from '@/hooks/useSocket';
import { alertService } from '@/services';
import Link from 'next/link';
import { logError, logInfo } from '@/utils/logger';
import { ChatMessage, FrontendRoom } from '@/types/typings';

interface ChatMessageListProps {
  selectedRoomId: number | null;
  messages: ChatMessage[];
  isLoading: boolean;
  roomInfo?: FrontendRoom | null;
}


/**
 * Renders the list of chat messages for a selected room, including the header,
 * message groups, input area, and related modals. Handles message grouping,
 * reactions, read receipts via Intersection Observer, and member management actions.
 */
const ChatMessageList: React.FC<ChatMessageListProps> = ({ selectedRoomId, messages, roomInfo, isLoading }) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user, markRoomAsRead } = useUser();
  const currentUserId = user?.id;
  const { socket, isConnected, emitAddReaction, emitRemoveReaction, emitMarkAsRead } = useSocket(user?.id);

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isCreatingGroupFromDM, setIsCreatingGroupFromDM] = useState(false);
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] = useState(false);
  const [isMemberActionLoading, setIsMemberActionLoading] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  // Reply state (kept here to show context above input, passed to MessageInput)
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messageElementRefs = useRef<Map<number, HTMLElement>>(new Map());
  const messagesMarkedAsRead = useRef<Set<number>>(new Set());

  // Effect to synchronize the local chatMessages state when the messages prop changes
  useEffect(() => {
    setChatMessages(messages);
  }, [messages]);

  // Effect to scroll to the bottom when new messages are added
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Effect sets up an IntersectionObserver to detect when incoming messages (not sent by the current user)
  // become visible in the viewport. When a message is ~80% visible, it emits a 'markAsRead' event
  // for that message ID and stops observing it to prevent duplicate events.
  useEffect(() => {
    if (!scrollViewportRef.current || !selectedRoomId || !currentUserId || !emitMarkAsRead) return;
    if (observerRef.current) { observerRef.current.disconnect(); messagesMarkedAsRead.current.clear(); }

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      const messagesToMark: number[] = [];
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const targetElement = entry.target as HTMLElement;
          const messageIdStr = targetElement.dataset.messageId;
          if (messageIdStr) {
            const messageId = parseInt(messageIdStr, 10);
            if (!messagesMarkedAsRead.current.has(messageId)) {
               messagesToMark.push(messageId);
               messagesMarkedAsRead.current.add(messageId);
               observerRef.current?.unobserve(targetElement);
            }
          }
        }
      });
      if (messagesToMark.length > 0) {
        logInfo(`Emitting markAsRead for messages: ${messagesToMark.join(', ')} in room ${selectedRoomId}`);
        emitMarkAsRead({ messageIds: messagesToMark, roomId: selectedRoomId });
      }
    };

    observerRef.current = new IntersectionObserver(observerCallback, { root: scrollViewportRef.current, threshold: 0.8 });

    messageElementRefs.current.forEach((element, messageId) => {
      const message = chatMessages.find(msg => msg.id === messageId);
      if (message && message.senderId !== currentUserId && !messagesMarkedAsRead.current.has(messageId)) {
        const alreadyReadByCurrentUser = message.readBy?.some(reader => reader.userId === currentUserId);
        if (!alreadyReadByCurrentUser) { observerRef.current?.observe(element); }
      }
    });

    return () => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; messagesMarkedAsRead.current.clear(); }
    };
  }, [chatMessages, selectedRoomId, currentUserId, emitMarkAsRead]);


  const handleShareAttackLog = async (logId: number) => {
    if (!selectedRoomId || !socket || !isConnected || !currentUserId) { alertService.error("Cannot share log."); return; }
    logInfo(`Emitting sendMessage to share attack log ${logId} in room ${selectedRoomId}`);
    socket.emit('sendMessage', {
      roomId: selectedRoomId, content: `Shared Attack Log #${logId}`,
      messageType: 'ATTACK_LOG_SHARE', sharedAttackLogId: logId
    });
    setIsShareModalOpen(false);
    markRoomAsRead(selectedRoomId);
  };


  // Memoized calculation to group consecutive messages from the same sender
  // if they were sent within a 60-second threshold. This improves display density.
  const groupedMessages = useMemo(() => {
    const groups: ChatMessage[][] = [];
    let currentGroup: ChatMessage[] = [];
    chatMessages.forEach((message, index) => {
      const previousMessage = chatMessages[index - 1];
      const isSameSender = previousMessage?.senderId === message.senderId;
      const currentSentAt = message.sentAt ? new Date(message.sentAt).getTime() : 0;
      const previousSentAt = previousMessage?.sentAt ? new Date(previousMessage.sentAt).getTime() : 0;
      const timeDiff = previousMessage && currentSentAt && previousSentAt ? currentSentAt - previousSentAt : Infinity;
      const withinTimeThreshold = timeDiff < 60000;
      if (isSameSender && withinTimeThreshold) { currentGroup.push(message); }
      else { if (currentGroup.length > 0) groups.push(currentGroup); currentGroup = [message]; }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }, [chatMessages]);

  // Handles toggling a reaction on a message.
  // It performs an optimistic update on the local state first for responsiveness,
  // then emits the corresponding add/remove event via socket.
  const handleToggleReaction = useCallback((messageId: number, clickedReaction: string) => {
    if (!selectedRoomId || !currentUserId || !user?.displayName) return;
    const messageIndex = chatMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;
    const message = chatMessages[messageIndex];
    const currentUserExistingReaction = message.reactions?.find(r => r.userId === currentUserId);
    const isTogglingSameReaction = currentUserExistingReaction?.reaction === clickedReaction;

    setChatMessages(currentMessages => {
      const updatedMessages = [...currentMessages];
      const targetMessage = { ...updatedMessages[messageIndex] };
      targetMessage.reactions = [...(targetMessage.reactions || [])];
      if (currentUserExistingReaction) { targetMessage.reactions = targetMessage.reactions.filter(r => r.userId !== currentUserId); }
      if (!isTogglingSameReaction) { targetMessage.reactions.push({ userId: currentUserId, reaction: clickedReaction, userDisplayName: user.displayName }); }
      updatedMessages[messageIndex] = targetMessage;
      return updatedMessages;
    });

    if (currentUserExistingReaction) { emitRemoveReaction({ messageId, reaction: currentUserExistingReaction.reaction, roomId: selectedRoomId }); }
    if (!isTogglingSameReaction) { emitAddReaction({ messageId, reaction: clickedReaction, roomId: selectedRoomId }); }
  }, [selectedRoomId, currentUserId, user?.displayName, chatMessages, emitAddReaction, emitRemoveReaction, setChatMessages]);

  const handleMemberAction = async (targetUserId: number, action: 'promote' | 'demote' | 'remove' | 'toggleWrite') => {
    if (!selectedRoomId || !roomInfo?.isAdmin) return;
    setIsMemberActionLoading(true);
    try {
      const targetParticipant = roomInfo?.participants?.find(p => p.id === targetUserId);
      const currentCanWrite = targetParticipant?.canWrite;
      const response = await fetch(`/api/messages/${selectedRoomId}/participants/${targetUserId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action === 'toggleWrite' ? 'updatePermissions' : action, ...(action === 'toggleWrite' && { canWrite: !currentCanWrite }) }),
      });
      if (response.ok) { alertService.success(`Action '${action}' completed.`); setIsManageMembersModalOpen(false); }
      else { const errorData = await response.json(); alertService.error(`Failed: ${errorData.message || 'Unknown error'}`); }
    } catch (error: any) { logError('Error managing member:', error); alertService.error(`Error: ${action} member.`); }
    finally { setIsMemberActionLoading(false); }
  };

  // Stable function reference for rendering specific message types (e.g., attack logs)
  // Wrapped in useCallback to prevent breaking memoization of renderedMessageArea.
  const renderMessageContent = useCallback((message: ChatMessage) => {
    if (message.messageType === 'ATTACK_LOG_SHARE' && message.sharedAttackLog) {
      const logId = message.sharedAttackLog.id;
      return (<Link href={`/battle/results/${logId}`} passHref legacyBehavior><Button variant="outline" size="xs" component="a" target="_blank" rel="noopener noreferrer">View Attack Log #{logId}</Button></Link>);
    }
    return message.content;
  }, []); // No dependencies, this function is stable

  // Memoizes the rendering of the entire message list area.
  // This prevents re-rendering the list unnecessarily when parent state changes,
  // optimizing performance, especially for long conversations.
  const renderedMessageArea = useMemo(() => {
    if (isLoading) {
      return (
        <Stack gap="md" px="md" py="lg">
          {[...Array(5)].map((_, i) => (<Paper key={i} p="md" shadow="xs" radius="md" withBorder><Group><Skeleton height={40} circle /><div style={{ flex: 1 }}><Skeleton height={10} width="30%" mb={10} /><Skeleton height={10} width="80%" /></div></Group></Paper>))}
        </Stack>
      );
    }
    if (groupedMessages.length === 0) {
      return (
        <Center className="h-full flex-col"><FontAwesomeIcon icon={faCommentSlash} size="3x" color="gray" /><Text color="dimmed" mt="md">No messages yet.</Text></Center>
      );
    }
    return (
      <Stack gap="lg" py="md">
        {groupedMessages.map((group, idx) => (
          <ChatMessageGroup
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
        <div ref={bottomRef}></div>
      </Stack>
    );
  // Dependencies include renderMessageContent now that it's stable via useCallback
  }, [isLoading, groupedMessages, currentUserId, handleToggleReaction, setReplyingToMessage, renderMessageContent]);


  if (!selectedRoomId) {
    return (
      <Center className="h-full bg-gray-800 flex-col">
        <FontAwesomeIcon icon={faComment} size="4x" color="gray" />
        <Title order={3} c="dimmed" mt="md">Select a conversation</Title>
      </Center>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Paper p="md" className="w-full border-b border-gray-700" withBorder={false}>
        <div className="flex justify-between items-center w-full">
          <Group gap='xs' className="flex-grow-0">
            {roomInfo?.isDirect ? (
              <Avatar size="md" radius="xl" color="blue" src={roomInfo?.participants?.find(p => p.id !== currentUserId)?.avatar}>
                {(roomInfo?.participants?.find(p => p.id !== currentUserId)?.display_name?.charAt(0) || '?').toUpperCase()}
              </Avatar>
            ) : (
              <Avatar size="md" radius="xl" color="violet">{(roomInfo?.name?.charAt(0) || '?').toUpperCase()}</Avatar>
            )}
            <div>
              <Text fw={600} size="lg">{roomInfo?.name || 'Chat'}</Text>
              {roomInfo?.isDirect && (
                <Text size="xs" c={roomInfo?.participants?.find(p => p.id !== currentUserId)?.is_online ? 'teal' : 'dimmed'}>
                  {roomInfo?.participants?.find(p => p.id !== currentUserId)?.is_online ? 'Online' : 'Offline'}
                </Text>
              )}
              {!roomInfo?.isDirect && (
                <Text size="xs" c="dimmed">{roomInfo?.participants?.length || 0} members · {roomInfo?.isPrivate ? 'Private' : 'Public'}</Text>
              )}
            </div>
          </Group>
          <Group gap='xs' className="flex-grow-0">
            {roomInfo?.isDirect && (
              <Tooltip label="Create group chat"><ActionIcon variant="subtle" color="blue" onClick={() => { setIsCreatingGroupFromDM(true); setIsAddUserModalOpen(true); }}><FontAwesomeIcon icon={faUserPlus} /></ActionIcon></Tooltip>
            )}
            {!roomInfo?.isDirect && (roomInfo?.isAdmin || !roomInfo?.isPrivate) && (
              <Tooltip label="Add members"><ActionIcon variant="subtle" color="blue" onClick={() => { setIsCreatingGroupFromDM(false); setIsAddUserModalOpen(true); }}><FontAwesomeIcon icon={faUserPlus} /></ActionIcon></Tooltip>
            )}
            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target><ActionIcon variant="subtle"><FontAwesomeIcon icon={faEllipsisV} /></ActionIcon></Menu.Target>
              <Menu.Dropdown>
                {roomInfo?.isAdmin && !roomInfo.isDirect && (<><Menu.Label>Admin Controls</Menu.Label><Menu.Item onClick={() => setIsManageMembersModalOpen(true)}>Manage members</Menu.Item><Menu.Item>Edit group info</Menu.Item><Menu.Divider /></>)}
                <Menu.Item>Search messages</Menu.Item>
                <Menu.Item>Mute notifications</Menu.Item>
                {roomInfo?.isAdmin && !roomInfo.isDirect && (<Menu.Item color="red">Delete group</Menu.Item>)}
                {roomInfo?.isDirect && (<Menu.Item color="red">Delete conversation</Menu.Item>)}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>
      </Paper>

      <div className="flex-1 overflow-hidden">
        <ScrollArea viewportRef={scrollViewportRef} className="h-full px-4" type='auto'>
          {renderedMessageArea}
        </ScrollArea>
      </div>

      <MessageInput
        selectedRoomId={selectedRoomId}
        socket={socket}
        isConnected={isConnected}
        currentUserId={currentUserId}
        user={user} // Pass user object
        markRoomAsRead={markRoomAsRead}
        replyingToMessage={replyingToMessage}
        setReplyingToMessage={setReplyingToMessage}
        setIsShareModalOpen={setIsShareModalOpen}
        canWrite={roomInfo?.participants?.find(p => p.id === currentUserId)?.canWrite ?? false}
      />

      <NewMessageModal
        opened={isAddUserModalOpen}
        onClose={() => { setIsAddUserModalOpen(false); setIsCreatingGroupFromDM(false); }}
        existingChatId={isCreatingGroupFromDM ? undefined : selectedRoomId}
        existingUsers={roomInfo?.participants?.map(p => p.id)}
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
            {roomInfo?.participants?.map(participant => (
              <Table.Tr key={participant.id}>
                <Table.Td>
                  <Group gap="xs">
                    <Avatar src={participant.avatar} size="sm" radius="xl">{(participant.display_name || '?').charAt(0).toUpperCase()}</Avatar>
                    <Text>{participant.display_name} {participant.id === currentUserId ? '(You)' : ''}</Text>
                  </Group>
                </Table.Td>
                <Table.Td><Badge color={participant.role === 'ADMIN' ? 'pink' : 'gray'}>{participant.role}</Badge></Table.Td>
                <Table.Td>
                  <Switch
                    checked={participant.canWrite}
                    disabled={participant.id === currentUserId || isMemberActionLoading}
                    onChange={() => handleMemberAction(participant.id, 'toggleWrite')}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {participant.id !== currentUserId && participant.id !== roomInfo?.createdById && (
                      <>
                        {participant.role === 'MEMBER' ? (
                          <Tooltip label="Make admin">
                            <ActionIcon color="green" onClick={() => handleMemberAction(participant.id, 'promote')} loading={isMemberActionLoading}>
                              <FontAwesomeIcon icon={faUserShield} />
                            </ActionIcon>
                          </Tooltip>
                        ) : (
                          <Tooltip label="Remove admin">
                            <ActionIcon color="orange" onClick={() => handleMemberAction(participant.id, 'demote')} loading={isMemberActionLoading}>
                              <FontAwesomeIcon icon={faUserSlash} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Remove from group">
                          <ActionIcon color="red" onClick={() => handleMemberAction(participant.id, 'remove')} loading={isMemberActionLoading}>
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

export default ChatMessageList;