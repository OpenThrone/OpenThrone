import React from 'react';
import { Group, Indicator, Avatar, Paper, Stack, Text, Tooltip, Badge, Popover, SimpleGrid, ActionIcon } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCheckDouble, faComment, faSmile } from '@fortawesome/free-solid-svg-icons';
import { formatLastMessageTime } from '@/utils/timefunctions';
import { ChatMessage } from '@/types/typings';

interface ChatMessageGroupProps {
  group: ChatMessage[];
  isCurrentUser: boolean;
  currentUserId: number | undefined;
  handleToggleReaction: (messageId: number, reaction: string) => void;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  renderMessageContent: (message: ChatMessage) => React.ReactNode;
  messageElementRefs: React.MutableRefObject<Map<number, HTMLElement>>; // Pass the ref map
}

const ChatMessageGroupComponent: React.FC<ChatMessageGroupProps> = ({
  group,
  isCurrentUser,
  currentUserId,
  handleToggleReaction,
  setReplyingToMessage,
  renderMessageContent,
  messageElementRefs,
}) => {
  const lastMessageInGroup = group[group.length - 1];

  return (
    <Group justify={isCurrentUser ? "flex-end" : "flex-start"} gap="xs" p="xs" align="flex-start">
      {!isCurrentUser && (
        <Indicator color={group[0].sender?.is_online ? 'teal' : 'gray'} size={10} offset={7} position="bottom-end" withBorder>
          <Avatar src={group[0].sender?.avatar} size="md" radius="xl" color="blue" alt={group[0].sender?.display_name || 'User'}>
            {(group[0].sender?.display_name || '?').charAt(0).toUpperCase()}
          </Avatar>
        </Indicator>
      )}
      <Paper p="md" radius="lg" shadow="sm" bg={isCurrentUser ? 'blue.7' : 'dark.5'} style={{ maxWidth: '70%', wordBreak: 'break-word' }}>
        {!isCurrentUser && (<Text size="sm" fw={600} mb={4} color='blue.3'>{group[0]?.sender?.display_name || 'Unknown User'}</Text>)}
        <Stack gap={6}>
          {group.map((message) => {
            // Callback ref to store element refs in the map
            const messageRefCallback = (node: HTMLDivElement | null) => {
              if (node && message.senderId !== currentUserId) { messageElementRefs.current.set(message.id, node); }
              else { messageElementRefs.current.delete(message.id); }
            };
            return (
              <div key={message.id} ref={messageRefCallback} data-message-id={message.id}>
                {message.replyToMessage && (
                  <Paper p="xs" mb="xs" radius="sm" withBorder bg={isCurrentUser ? 'blue.8' : 'dark.6'}>
                    <Text size="xs" c="dimmed">Replying to {message.replyToMessage.sender.display_name}</Text>
                    <Text size="sm" lineClamp={2} fs="italic">{message.replyToMessage.content}</Text>
                  </Paper>
                )}
                <Text size="md" color={isCurrentUser ? 'white' : undefined}>{renderMessageContent(message)}</Text>
                {message.reactions && message.reactions.length > 0 && (
                  <Group gap={4} mt={4} wrap="wrap">
                    {Object.entries(message.reactions.reduce((acc, r) => { acc[r.reaction] = (acc[r.reaction] || 0) + 1; return acc; }, {} as Record<string, number>))
                      .map(([reaction, count]) => {
                        const reactors = message.reactions.filter(r => r.reaction === reaction).map(r => r.userId === currentUserId ? 'You' : r.userDisplayName).join(', ');
                        const isCurrentUserReaction = message.reactions.some(r => r.userId === currentUserId && r.reaction === reaction);
                        return (
                          <Tooltip key={reaction} label={reactors} position="top" withArrow>
                            <Badge size="sm" radius="sm" variant={isCurrentUserReaction ? 'filled' : 'light'} color={isCurrentUserReaction ? 'blue' : 'gray'} onClick={() => handleToggleReaction(message.id, reaction)} style={{ cursor: 'pointer' }}>{reaction} {count}</Badge>
                          </Tooltip>
                        );
                      })}
                  </Group>
                )}
              </div>
            );
          })}
        </Stack>
        <Group justify="space-between" align="center" mt={6} gap="xs">
          <Group gap={4} align="center">
            <Text size="xs" color={isCurrentUser ? 'blue.0' : 'dimmed'} ta="right">{formatLastMessageTime(lastMessageInGroup?.sentAt)}</Text>
            {isCurrentUser && (() => {
              const readers = (lastMessageInGroup.readBy || []).filter(r => r.userId !== currentUserId).map(r => r.userDisplayName || `User ${r.userId}`);
              const isReadByOthers = readers.length > 0;
              const readTooltipLabel = isReadByOthers ? `Read by: ${readers.slice(0, 3).join(', ')}${readers.length > 3 ? ` and ${readers.length - 3} more` : ''}` : 'Sent';
              return (
                <Tooltip label={readTooltipLabel} position="top" withArrow>
                  <span><FontAwesomeIcon icon={isReadByOthers ? faCheckDouble : faCheck} size="xs" color={isReadByOthers ? 'cyan' : (isCurrentUser ? '#adb5bd' : '#495057')} /></span>
                </Tooltip>
              );
            })()}
          </Group>
          <Group gap={2} align="center">
             <Tooltip label="Reply" position="top" withArrow>
                <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setReplyingToMessage(lastMessageInGroup)}>
                   <FontAwesomeIcon icon={faComment} />
                </ActionIcon>
             </Tooltip>
             <Popover width={200} position="bottom-end" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon size="xs" variant="subtle" color="gray">
                  <FontAwesomeIcon icon={faSmile} />
                </ActionIcon>
              </Popover.Target>
               <Popover.Dropdown p="xs">
                 <SimpleGrid cols={6} spacing="xs">
                   {['👍', '❤️', '😂', '😮', '😢', '😠'].map((emoji) => { //TODO: Let's refactor this later to be able to change the reactions
                     const currentUserReaction = lastMessageInGroup.reactions?.find(r => r.userId === currentUserId);
                     const isSelected = currentUserReaction?.reaction === emoji;
                     return (
                       <ActionIcon key={emoji} variant={isSelected ? "light" : "subtle"} color={isSelected ? "blue" : "gray"} onClick={() => handleToggleReaction(lastMessageInGroup.id, emoji)}>
                         <Text size="lg">{emoji}</Text>
                       </ActionIcon>
                     );
                   })}
                 </SimpleGrid>
               </Popover.Dropdown>
             </Popover>
          </Group>
        </Group>
      </Paper>
      {isCurrentUser && (
        <Indicator color={group[0].sender?.is_online ? 'teal' : 'gray'} size={10} offset={7} position="bottom-end" withBorder>
          <Avatar src={group[0].sender?.avatar} size="md" radius="xl" color="blue" alt="You">{(group[0].sender?.display_name || 'Y').charAt(0).toUpperCase()}</Avatar>
        </Indicator>
      )}
    </Group>
  );
};

const ChatMessageGroup = React.memo(ChatMessageGroupComponent);
export default ChatMessageGroup;