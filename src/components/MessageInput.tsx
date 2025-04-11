import React, { useState, useCallback } from 'react';
import { TextInput, Paper, Group, ActionIcon, Tooltip, Box, Text, CloseButton } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faPaperclip } from '@fortawesome/free-solid-svg-icons';
import { Socket } from 'socket.io-client';
import { User } from 'next-auth';
import { ChatMessage } from '@/types/typings'; // Import from shared types file
import { alertService } from '@/services';
import { logInfo } from '@/utils/logger';

interface MessageInputProps {
  selectedRoomId: number | null;
  socket: Socket | null;
  isConnected: boolean;
  currentUserId: number | undefined;
  user: User | null | undefined;
  markRoomAsRead: (roomId: number) => void; // Function to mark room as read
  replyingToMessage: ChatMessage | null;
  setReplyingToMessage: (message: ChatMessage | null) => void;
  setIsShareModalOpen: (isOpen: boolean) => void; // To open the share modal
  canWrite: boolean; // Pass write permission
}

const MessageInput: React.FC<MessageInputProps> = ({
  selectedRoomId,
  socket,
  isConnected,
  currentUserId,
  user,
  markRoomAsRead,
  replyingToMessage,
  setReplyingToMessage,
  setIsShareModalOpen,
  canWrite
}) => {
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedRoomId || !content.trim() || !socket || !isConnected || !currentUserId) {
      console.log("MessageInput: Cannot send message. Conditions not met.");
      return;
    }

    const messageContent = content.trim();
    logInfo(`MessageInput: Emitting sendMessage for room ${selectedRoomId}`);

    // Emit the message via socket
    socket.emit('sendMessage', {
      roomId: selectedRoomId,
      content: messageContent,
      replyToMessageId: replyingToMessage?.id // Include reply ID
    });

    // Clear state after sending
    markRoomAsRead(selectedRoomId);
    setReplyingToMessage(null);
    setNewMessage('');

  }, [selectedRoomId, socket, isConnected, currentUserId, markRoomAsRead, replyingToMessage, setReplyingToMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(newMessage);
  };

  return (
    <Paper component="form" onSubmit={handleSubmit} className="border-t p-3 bg-gray-900 border-gray-700" shadow="sm">
      {replyingToMessage && (
        <Box p="xs" mb="xs" bg="dark.6" style={{ borderTopLeftRadius: 'var(--mantine-radius-sm)', borderTopRightRadius: 'var(--mantine-radius-sm)' }}>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed">Replying to {replyingToMessage.sender.display_name}</Text>
              <Text size="sm" lineClamp={1}>{replyingToMessage.content}</Text>
            </div>
            <CloseButton size="sm" onClick={() => setReplyingToMessage(null)} title="Cancel reply" />
          </Group>
        </Box>
      )}
      <Group gap="xs" wrap="nowrap" mt={replyingToMessage ? 0 : 'xs'}>
        <Tooltip label="Share Attack Log">
          <ActionIcon variant="subtle" onClick={() => setIsShareModalOpen(true)} size="lg" disabled={!canWrite}>
            <FontAwesomeIcon icon={faPaperclip} />
          </ActionIcon>
        </Tooltip>
        <TextInput
          placeholder={replyingToMessage ? "Type your reply..." : "Type your message..."}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-1"
          disabled={!canWrite} // Use passed prop
          rightSection={
            <ActionIcon type="submit" variant="filled" color="blue" size="lg" disabled={!newMessage.trim() || !canWrite}>
              <FontAwesomeIcon icon={faPaperPlane} />
            </ActionIcon>
          }
          rightSectionWidth={42}
          styles={{ input: { paddingRight: 42 } }}
        />
      </Group>
    </Paper>
  );
};

export default MessageInput;

// NOTE: You might need to adjust the import path for `ChatMessage`
// if it's not exported from ChatMessageList.tsx or defined globally.
// Consider moving the ChatMessage interface to a shared types file (e.g., src/types/typings.d.ts).