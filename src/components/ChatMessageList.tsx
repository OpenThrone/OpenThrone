import { useUser } from '@/context/users';
import { formatLastMessageTime } from '@/utils/timefunctions';
import {
  faComment, faCommentSlash, faEllipsisV, faPaperPlane, faTrash,
  faUserPlus, faUserShield, faUserSlash, faPaperclip // Added Paperclip
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ScrollArea, Indicator, Avatar, Text, Center, Title, ActionIcon, Group, Paper,
  Skeleton, Stack, TextInput, Menu, Tooltip, Badge, Modal, Switch, Table, Button // Added Button
} from '@mantine/core';
import NewMessageModal from '@/components/NewMessageModal';
import AttackLogShareModal from '@/components/AttackLogShareModal'; // Import the new modal
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useSocket from '@/hooks/useSocket';
import { alertService } from '@/services'; // Import alert service
import Link from 'next/link'; // Import Link

interface ChatMessage {
  id: number;
  senderId: number;
  content: string;
  sentAt: string;
  sender?: {
    is_online?: boolean;
    avatar?: string;
    display_name?: string;
  };
}

interface ChatMessageListProps {
  selectedRoomId: number | null;
  messages: ChatMessage[];
  isLoading: boolean; // Receive loading state
  roomInfo?: {
    id: number;
    name: string;
    isDirect: boolean;
    isPrivate: boolean;
    isAdmin: boolean;
    createdById: number;
    createdAt: string;
    updatedAt: string;
    lastMessage?: string | null;
    lastMessageTime?: string | null;
    lastMessageSender?: string | null;
    unreadCount?: number;
    participants?: Array<{
      id: number; // Participant ID (user ID)
      role: 'ADMIN' | 'MEMBER';
      canWrite: boolean;
      display_name: string;
      avatar?: string;
      is_online: boolean;
    }>;
  };
}


const ChatMessageList: React.FC<ChatMessageListProps> = ({ selectedRoomId, messages, roomInfo, isLoading }) => {
  const [newMessage, setNewMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages); // Use local state derived from props
  //const [isLoading, setIsLoading] = useState(false); // isLoading passed as prop now
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user, markRoomAsRead } = useUser(); // Get markRoomAsRead
  const currentUserId = user?.id;
  const { socket, isConnected } = useSocket(user?.id);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false); // Renamed state
  const [isCreatingGroupFromDM, setIsCreatingGroupFromDM] = useState(false);
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] = useState(false);
  const [isMemberActionLoading, setIsMemberActionLoading] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false); // State for attack log share modal


  // Update local state when messages prop changes
  useEffect(() => {
    setChatMessages(messages);
  }, [messages]);

  // Fetch messages moved to parent component (index.tsx)

  // Auto-scroll to the bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]); // Trigger scroll when local chatMessages change

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedRoomId || !content.trim() || !socket || !isConnected || !currentUserId) {
      console.log("Cannot send message. Conditions not met.", { selectedRoomId, content, socket, isConnected, currentUserId });
      return;
    }

    const messageContent = content.trim();
    const tempId = Date.now(); // Use a timestamp as a temporary ID

    // Optimistic UI update
    const optimisticMessage: ChatMessage = {
      id: tempId,
      senderId: currentUserId,
      content: messageContent,
      sentAt: new Date().toISOString(),
      sender: { // Include sender info for optimistic render
        display_name: user?.displayName,
        avatar: user?.avatar,
        is_online: true // Assume online for self
      },
    };

    setChatMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    // Don't clear input here, handle after successful emit if needed

    console.log(`Emitting sendMessage for room ${selectedRoomId}`);
    socket.emit('sendMessage', { roomId: selectedRoomId, content: messageContent });

    // Mark room as read after sending a message
    markRoomAsRead(selectedRoomId);

    setNewMessage(''); // Clear input after sending attempt

    // Add optimistic update error handling (optional)
    // You might add a timeout to check if the server confirmed the message
    // and remove the optimistic one if confirmation isn't received.
  }, [selectedRoomId, socket, isConnected, currentUserId, user, markRoomAsRead]); // Add dependencies


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(newMessage);
  };

  // --- Attack Log Sharing ---
  const handleShareAttackLog = async (logId: number) => {
    const shareContent = `[Attack Log: ${logId}]`;
    // We should make an API request to update attack_log_acl
    // it'll need to grab the participants and give them the same
    // acl permissions as the current user
    const result = await fetch(`/api/attack/logs/${logId}/acl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: currentUserId, roomId: selectedRoomId }),
    });
    if (!result.ok) {
      alertService.error('Failed to share attack log.');
      return;
    }
    handleSendMessage(shareContent); // Use the existing send message logic
    setIsShareModalOpen(false); // Close the modal
  };

  // Group messages by sender and time (within 60 seconds)
  const groupedMessages = useMemo(() => {
    const groups: ChatMessage[][] = [];
    let currentGroup: ChatMessage[] = [];

    chatMessages.forEach((message, index) => {
      const previousMessage = chatMessages[index - 1];
      const isSameSender = previousMessage?.senderId === message.senderId;
      const timeDiff = previousMessage ? new Date(message.sentAt).getTime() - new Date(previousMessage.sentAt).getTime() : Infinity;
      const withinTimeThreshold = timeDiff < 60000; // 60 seconds

      if (isSameSender && withinTimeThreshold) {
        currentGroup.push(message);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [message];
      }
    });
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    return groups;
  }, [chatMessages]);

  // --- Member Management ---
  const handleMemberAction = async (targetUserId: number, action: 'promote' | 'demote' | 'remove' | 'toggleWrite') => {
    if (!selectedRoomId || !roomInfo?.isAdmin) return;

    setIsMemberActionLoading(true);
    try {
      // Find the current participant data to get `canWrite` status for toggle
      const targetParticipant = roomInfo?.participants?.find(p => p.id === targetUserId);
      const currentCanWrite = targetParticipant?.canWrite;

      const response = await fetch(`/api/messages/${selectedRoomId}/participants/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action === 'toggleWrite' ? 'updatePermissions' : action,
          // If toggling write, send the new value
          ...(action === 'toggleWrite' && { canWrite: !currentCanWrite })
        }),
      });

      if (response.ok) {
        alertService.success(`Action '${action}' completed successfully for user.`);
        // TODO: Ideally, fetch updated roomInfo here instead of closing immediately
        // For now, close the modal; parent component might need refresh logic
        setIsManageMembersModalOpen(false);
        // Trigger a refresh in the parent component if possible
        // Example: onRoomInfoUpdate(); // Assuming a prop like this exists
      } else {
        const errorData = await response.json();
        alertService.error(`Failed to ${action} member: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error managing member:', error);
      alertService.error(`An error occurred while trying to ${action} member.`);
    } finally {
      setIsMemberActionLoading(false);
    }
  };

  // --- Message Rendering ---
  const renderMessageContent = (content: string) => {
    const attackLogRegex = /\[Attack Log: (\d+)\]/;
    const match = content.match(attackLogRegex);

    if (match) {
      const logId = match[1];
      const beforeText = content.substring(0, match.index);
      const afterText = content.substring(match.index + match[0].length);

      return (
        <>
          {beforeText}
          <Link href={`/battle/results/${logId}`} passHref>
            <Button variant="outline" size="xs" component="a" target="_blank" rel="noopener noreferrer">
              View Attack Log #{logId}
            </Button>
          </Link>
          {afterText}
        </>
      );
    }
    return content;
  };

  // Empty state when no chat is selected
  if (!selectedRoomId) {
    return (
      <Center className="h-full bg-gray-800 flex-col">
        <FontAwesomeIcon icon={faComment} size="4x" color="gray" />
        <Title order={3} c="dimmed" mt="md">
          Select a conversation to start chatting
        </Title>
      </Center>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Chat Header */}
      <Paper p="md" className="w-full border-b border-gray-700" withBorder={false}>
        <div className="flex justify-between items-center w-full">
          {/* Room info */}
          <Group gap='xs' className="flex-grow-0">
            {/* ... (Avatar and Room Name logic remains the same) ... */}
            {roomInfo?.isDirect ? (
              <Avatar
                size="md"
                radius="xl"
                color="blue"
                src={roomInfo?.participants?.find(p => p.id !== currentUserId)?.avatar}
              >
                {(roomInfo?.participants?.find(p => p.id !== currentUserId)?.display_name?.charAt(0) || '?').toUpperCase()}
              </Avatar>
            ) : (
              <Avatar
                size="md"
                radius="xl"
                color="violet"
              >
                {(roomInfo?.name?.charAt(0) || '?').toUpperCase()}
              </Avatar>
            )}
            <div>
              <Text fw={600} size="lg">
                {roomInfo?.name || 'Chat'}
              </Text>
              {roomInfo?.isDirect && (
                <Text size="xs" c={roomInfo?.participants?.find(p => p.id !== currentUserId)?.is_online ? 'teal' : 'dimmed'}>
                  {roomInfo?.participants?.find(p => p.id !== currentUserId)?.is_online ? 'Online' : 'Offline'}
                </Text>
              )}
              {!roomInfo?.isDirect && (
                <Text size="xs" c="dimmed">
                  {roomInfo?.participants?.length || 0} members · {roomInfo?.isPrivate ? 'Private' : 'Public'}
                </Text>
              )}
            </div>
          </Group>
          {/* Action icons */}
          <Group gap='xs' className="flex-grow-0">
            {/* ... (Add/Create Group logic remains the same) ... */}
            {roomInfo?.isDirect && (
              <Tooltip label="Create group chat with this person">
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  onClick={() => {
                    setIsCreatingGroupFromDM(true);
                    setIsAddUserModalOpen(true); // Use the renamed state
                  }}
                >
                  <FontAwesomeIcon icon={faUserPlus} />
                </ActionIcon>
              </Tooltip>
            )}

            {!roomInfo?.isDirect && (roomInfo?.isAdmin || !roomInfo?.isPrivate) && (
              <Tooltip label="Add members">
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  onClick={() => {
                    setIsCreatingGroupFromDM(false);
                    setIsAddUserModalOpen(true); // Use the renamed state
                  }}
                >
                  <FontAwesomeIcon icon={faUserPlus} />
                </ActionIcon>
              </Tooltip>
            )}
            {/* More options menu */}
            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle">
                  <FontAwesomeIcon icon={faEllipsisV} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {/* ... (Menu items logic remains the same) ... */}
                {roomInfo?.isAdmin && !roomInfo.isDirect && (
                  <>
                    <Menu.Label>Admin Controls</Menu.Label>
                    <Menu.Item onClick={() => setIsManageMembersModalOpen(true)}>Manage members</Menu.Item>
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

      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-4" type='auto'>
          {isLoading ? ( // Use isLoading prop
            <Stack gap="md" px="md" py="lg">
              {[...Array(5)].map((_, i) => ( /* Skeleton loader */
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
          ) : groupedMessages.length === 0 ? ( /* Empty state */
            <Center className="h-full flex-col">
              <FontAwesomeIcon icon={faCommentSlash} size="3x" color="gray" />
              <Text color="dimmed" mt="md">
                No messages yet. Start the conversation!
              </Text>
            </Center>
          ) : ( /* Render messages */
            <Stack gap="lg" py="md">
              {groupedMessages.map((group, idx) => {
                const isCurrentUser = group[0].senderId === currentUserId;
                return (
                  <Group
                    key={`group-${idx}`}
                    justify={isCurrentUser ? "flex-end" : "flex-start"}
                    gap="xs"
                    p="xs"
                    align="flex-start" // Align avatar to the top
                  >
                    {/* Avatar for other users */}
                    {!isCurrentUser && (
                      <Indicator
                        color={group[0].sender?.is_online ? 'teal' : 'gray'}
                        size={10} // Smaller indicator
                        offset={7} // Adjust offset
                        position="bottom-end"
                        withBorder
                      >
                        <Avatar
                          src={group[0].sender?.avatar}
                          size="md"
                          radius="xl"
                          color="blue"
                          alt={group[0].sender?.display_name || 'User'}
                        >
                          {(group[0].sender?.display_name || '?').charAt(0).toUpperCase()}
                        </Avatar>
                      </Indicator>
                    )}
                    {/* Message Bubble */}
                    <Paper
                      p="md"
                      radius="lg"
                      shadow="sm"
                      bg={isCurrentUser ? 'blue.7' : 'dark.5'}
                      style={{
                        maxWidth: '70%',
                        wordBreak: 'break-word', // Ensure long words wrap
                      }}
                    >
                      {!isCurrentUser && (
                        <Text size="sm" fw={600} mb={4} color='blue.3'>
                          {group[0]?.sender?.display_name || 'Unknown User'}
                        </Text>
                      )}
                      <Stack gap={6}>
                        {group.map((message) => (
                          <Text key={message.id} size="md" color={isCurrentUser ? 'white' : undefined}>
                            {renderMessageContent(message.content)} {/* Use render function */}
                          </Text>
                        ))}
                      </Stack>
                      <Text size="xs" color={isCurrentUser ? 'blue.0' : 'dimmed'} mt={6} ta="right">
                        {formatLastMessageTime(group[group.length - 1]?.sentAt)} {/* Time of last message in group */}
                      </Text>
                    </Paper>
                    {/* Avatar for current user */}
                    {isCurrentUser && (
                      <Indicator
                        color={user?.is_online ? 'teal' : 'gray'}
                        size={10}
                        offset={7}
                        position="bottom-end"
                        withBorder
                      >
                        <Avatar
                          src={user?.avatar}
                          size="md"
                          radius="xl"
                          color="blue"
                          alt="You"
                        >
                          {(user?.displayName || 'Y').charAt(0).toUpperCase()}
                        </Avatar>
                      </Indicator>
                    )}
                  </Group>
                );
              })}
              <div ref={bottomRef}></div>
            </Stack>
          )}
        </ScrollArea>
      </div>

      {/* Input Box */}
      <Paper
        component="form"
        onSubmit={handleSubmit}
        className="border-t p-3 bg-gray-900 border-gray-700" // Adjusted border color
        shadow="sm"
      >
        {/* Check if the current user can write (moved logic to the disabled prop of TextInput) */}
        {(() => {
          console.log(roomInfo)
          return null;
        })()}
        <Group gap="xs" wrap="nowrap"> {/* Prevent wrapping */}
          {/* Attack Log Share Button */}
          <Tooltip label="Share Attack Log">
            <ActionIcon
              variant="subtle"
              onClick={() => setIsShareModalOpen(true)}
              size="lg"
            >
              <FontAwesomeIcon icon={faPaperclip} />
            </ActionIcon>
          </Tooltip>

          <TextInput
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            style={{ flex: 1 }} // Take remaining space
            radius="xl"
            size="md"
            // Send button integrated into rightSection
            rightSectionWidth={42} // Adjust width as needed
            rightSection={
              <ActionIcon
                type="submit"
                variant="filled"
                color="blue"
                size={32} // Adjust size
                radius="xl"
                disabled={!(roomInfo?.participants?.find(p => p.id === currentUserId)?.canWrite ?? false)} // Disable if user can't write
                loading={isLoading}
                style={{ marginRight: 5 }} // Add some margin
              >
                <FontAwesomeIcon icon={faPaperPlane} size="sm" />
              </ActionIcon>
            }
            // Disable input if user cannot write
            disabled={!roomInfo?.participants?.find(p => p.id === currentUserId)?.canWrite}
          />
        </Group>
      </Paper>

      {/* Modals */}
      <NewMessageModal
        opened={isAddUserModalOpen} // Use renamed state
        onClose={() => {
          setIsAddUserModalOpen(false);
          setIsCreatingGroupFromDM(false);
        }}
        existingChatId={selectedRoomId}
        existingUsers={roomInfo?.participants?.map(p => p.id) || []}
        isDirectMessage={isCreatingGroupFromDM && roomInfo?.isDirect}
      />
      <AttackLogShareModal
        opened={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onShare={handleShareAttackLog}
      />
      {/* Manage Members Modal */}
      <Modal
        opened={isManageMembersModalOpen}
        onClose={() => setIsManageMembersModalOpen(false)}
        title="Manage Members"
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
                    <Avatar src={participant.avatar} radius="xl" size="sm">
                      {participant.display_name?.[0]?.toUpperCase() || '?'}
                    </Avatar>
                    <div>
                      <Text size="sm">{participant.display_name}</Text>
                      <Text size="xs" c={participant.is_online ? 'teal' : 'dimmed'}>
                        {participant.is_online ? 'Online' : 'Offline'}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge color={participant.role === 'ADMIN' ? 'blue' : 'gray'}>
                    {participant.role}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={participant.canWrite}
                    disabled={participant.id === currentUserId || !roomInfo?.isAdmin || isMemberActionLoading}
                    onChange={() => handleMemberAction(participant.id, 'toggleWrite')}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {roomInfo?.isAdmin && participant.id !== currentUserId && (
                      <>
                        {participant.role === 'MEMBER' ? (
                          <Tooltip label="Make admin">
                            <ActionIcon
                              color="blue"
                              variant="subtle"
                              onClick={() => handleMemberAction(participant.id, 'promote')}
                              loading={isMemberActionLoading}
                            >
                              <FontAwesomeIcon icon={faUserShield} />
                            </ActionIcon>
                          </Tooltip>
                        ) : (
                          <Tooltip label="Remove admin">
                            <ActionIcon
                              color="yellow"
                              variant="subtle"
                              onClick={() => handleMemberAction(participant.id, 'demote')}
                              loading={isMemberActionLoading}
                            >
                              <FontAwesomeIcon icon={faUserSlash} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Remove from group">
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => handleMemberAction(participant.id, 'remove')}
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

export default ChatMessageList;