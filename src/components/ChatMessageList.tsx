import { useUser } from '@/context/users';
import { formatLastMessageTime } from '@/utils/timefunctions';
import { faComment, faCommentSlash, faEllipsisV, faPaperPlane, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ScrollArea, Indicator, Avatar, Text, Center, Title, ActionIcon, Group, Paper, Skeleton, Stack, TextInput, Menu, Tooltip } from '@mantine/core';
import NewMessageModal from '@/components/NewMessageModal';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

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
  roomInfo?: {
    id: number;
    name: string; 
    isDirect: boolean;
    isPrivate: boolean;
    isAdmin: boolean; // Whether current user is admin
    createdById: number;
    createdAt: string;
    updatedAt: string;
    lastMessage?: string | null;
    lastMessageTime?: string | null;
    lastMessageSender?: string | null;
    unreadCount?: number;
    participants?: Array<{
      id: number;
      role: 'ADMIN' | 'MEMBER';
      canWrite: boolean;
      display_name: string;
      avatar?: string;
      is_online: boolean;
    }>;
  };
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ selectedRoomId, messages, roomInfo }) => {
  const [newMessage, setNewMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const currentUserId = user?.id;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreatingGroupFromDM, setIsCreatingGroupFromDM] = useState(false);


  const fetchMessages = useCallback(async () => {
    if (!selectedRoomId) {
      setChatMessages([]);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/messages/${selectedRoomId}`);
      const data = await response.json();
      setChatMessages(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [selectedRoomId]);

  // Fetch messages when the selected room changes
  useEffect(() => {
    fetchMessages();
  }, [selectedRoomId, fetchMessages]);

  // Auto-scroll to the bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !newMessage.trim()) {
      return;
    }

    const messageContent = newMessage;
    const tempId = Date.now(); // Use a timestamp as a temporary ID

    // Create an optimistic message update
    const optimisticMessage: ChatMessage = {
      id: tempId,
      senderId: currentUserId || 0,
      content: messageContent,
      sentAt: new Date().toISOString(),
      sender: user, // optionally attach sender details
    };

    setChatMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage('');

    try {
      const response = await fetch(`/api/messages/${selectedRoomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageContent }),
      });

      if (response.ok) {
        // Re-fetch messages to ensure the UI is in sync with the server
        fetchMessages();
      } else {
        console.error('Failed to send message');
        // Remove the optimistic message if the request fails
        setChatMessages((prevMessages) =>
          prevMessages.filter((msg) => msg.id !== tempId)
        );
      }
    } catch (error) {
      console.error('Failed to send message', error);
      // Remove the optimistic message on error
      setChatMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== tempId)
      );
    }
  };

  // Group messages by sender and time (within 60 seconds)
  const groupedMessages = useMemo(() => {
    const groups: ChatMessage[][] = [];
    let currentGroup: ChatMessage[] = [];

    chatMessages.forEach((message, index) => {
      const previousMessage = chatMessages[index - 1];
      if (
        previousMessage &&
        previousMessage.senderId === message.senderId &&
        new Date(message.sentAt).getTime() - new Date(previousMessage.sentAt).getTime() < 60000
      ) {
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
          {/* Room info - left aligned */}
          <Group gap='xs' className="flex-grow-0">
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
                  {roomInfo?.isPrivate ? 'Private group' : 'Public group'}
                </Text>
              )}
            </div>
          </Group>

          {/* Action icons - right aligned */}
          <Group gap='xs' className="flex-grow-0">
            {/* For direct messages, show "Create group" button */}
            {roomInfo?.isDirect && (
              <Tooltip label="Create group chat with this person">
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  onClick={() => {
                    setIsCreatingGroupFromDM(true);
                    setIsModalOpen(true);
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
                    setIsModalOpen(true);
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
              {roomInfo?.isDirect && (
                <Menu.Item
                  leftSection={<FontAwesomeIcon icon={faUserPlus} />}
                  onClick={() => {
                    // Alternative way to create group from DM
                    console.log('Creating group from direct message (menu):', selectedRoomId);
                  }}
                >
                  Create group chat
                </Menu.Item>
              )}
              {roomInfo?.isAdmin && !roomInfo.isDirect && (
                <>
                  <Menu.Label>Admin Controls</Menu.Label>
                  <Menu.Item>Manage members</Menu.Item>
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
      
      {/* Messages area (scrollable) */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-4" type='auto'>
          {isLoading ? (
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
          ) : groupedMessages.length === 0 ? (
            <Center className="h-full flex-col">
              <FontAwesomeIcon icon={faCommentSlash} size="3x" color="gray" />
              <Text color="dimmed" mt="md">
                No messages yet. Start the conversation!
              </Text>
            </Center>
          ) : (
            <Stack gap="lg" py="md">
              {groupedMessages.map((group, idx) => {
                const isCurrentUser = group[0].senderId === currentUserId;
                return (
                  <Group
                    key={`group-${idx}`}
                    justify={isCurrentUser ? "flex-end" : "flex-start"}
                    gap="xs"
                    p="xs"
                    align="flex-start"
                  >
                    {!isCurrentUser && (
                      <Indicator
                        color={group[0].sender?.is_online ? 'teal' : 'gray'}
                        size={12}
                        position="bottom-end"
                      >
                        <Avatar
                          src={group[0].sender?.avatar}
                          size="md"
                          radius="xl"
                          color="blue"
                        >
                          {(group[0].sender?.display_name || 'U').charAt(0).toUpperCase()}
                        </Avatar>
                      </Indicator>
                    )}
                    <Paper
                      p="md"
                      radius="lg"
                      shadow="sm"
                      bg={isCurrentUser ? 'blue.7' : 'dark.5'}
                      style={{
                        maxWidth: '70%',
                      }}
                    >
                      {!isCurrentUser && (
                        <Text size="sm" fw={600} mb={4} color={isCurrentUser ? 'white' : 'blue.3'}>
                          {group[0]?.sender?.display_name || 'Unknown User'}
                        </Text>
                      )}
                      <Stack gap={6}>
                        {group.map((message) => (
                          <Text key={message.id} size="md" color={isCurrentUser ? 'white' : undefined}>
                            {message.content}
                          </Text>
                        ))}
                      </Stack>
                      <Text size="xs" color={isCurrentUser ? 'blue.0' : 'dimmed'} mt={6} ta="right">
                        {formatLastMessageTime(group[0]?.sentAt)}
                      </Text>
                    </Paper>
                    {isCurrentUser && (
                      <Indicator
                        color={user?.is_online ? 'teal' : 'gray'}
                        size={12}
                        position="bottom-end"
                      >
                        <Avatar
                          src={user?.avatar}
                          size="md"
                          radius="xl"
                          color="blue"
                        >
                          {(user?.displayName || 'You').charAt(0).toUpperCase()}
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

      {/* Input Box fixed to the bottom */}
      <Paper
        component="form"
        onSubmit={handleSubmit}
        className="border-t p-3 bg-gray-900"
        shadow="sm"
      >
        <Group gap="xs">
          <TextInput
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            style={{ flex: 1 }}
            radius="xl"
            size="md"
            rightSection={
              <ActionIcon
                type="submit"
                variant="filled"
                color="blue"
                size="lg"
                radius="xl"
                disabled={!newMessage.trim()}
              >
                <FontAwesomeIcon icon={faPaperPlane} size="sm" />
              </ActionIcon>
            }
          />
        </Group>
      </Paper>
      <NewMessageModal
        opened={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setIsCreatingGroupFromDM(false);
        }}
        existingChatId={selectedRoomId}
        existingUsers={roomInfo?.participants?.map(p => p.id) || []}
        isDirectMessage={isCreatingGroupFromDM && roomInfo?.isDirect}
      />
    </div>
    
  );
};

export default ChatMessageList;
