import { useUser } from '@/context/users';
import { formatLastMessageTime } from '@/utils/timefunctions';
import { ScrollArea, Indicator, Avatar, Text } from '@mantine/core';
import clsx from 'clsx';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface ChatMessage {
  id: number;
  senderId: number;
  content: string;
  sentAt: string;
  // Optional sender info (assumed to be returned from the API)
  sender?: {
    is_online?: boolean;
    avatar?: string;
    display_name?: string;
  };
}

interface ChatMessageListProps {
  selectedRoomId: number | null;
  messages: ChatMessage[];
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ selectedRoomId, messages }) => {
  const [newMessage, setNewMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const currentUserId = user?.id;

  const fetchMessages = useCallback(async () => {
    if (!selectedRoomId) {
      setChatMessages([]);
      return;
    }
    try {
      const response = await fetch(`/api/messages/${selectedRoomId}`);
      const data = await response.json();
      setChatMessages(data);
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

  return (
    <div className="flex flex-col h-full">
      {/* Messages area (scrollable) */}
      <div className="flex-1">
        <ScrollArea className="h-full">
          {groupedMessages.map((group, idx) => {
            const isCurrentUser = group[0].senderId === currentUserId;
            return (
              <div
                key={`group-${idx}`}
                className={clsx(
                  'flex items-start space-x-2',
                  isCurrentUser ? 'justify-end' : 'justify-start'
                )}
              >
                {!isCurrentUser && (
                  <Indicator color={group[0].sender?.is_online ? 'teal' : 'red'}>
                    <Avatar src={group[0].sender?.avatar} size={40} radius={40} />
                  </Indicator>
                )}
                <div
                  className={clsx(
                    'max-w-xs px-4 py-2 rounded-lg',
                    isCurrentUser ? 'bg-gray-700 self-end' : 'bg-gray-800'
                  )}
                >
                  {!isCurrentUser && (
                    <Text className="text-sm font-bold">
                      {group[0]?.sender?.display_name}
                    </Text>
                  )}
                  {group.map((message) => (
                    <Text key={message.id}>{message.content}</Text>
                  ))}
                  <span className="text-xs text-gray-500 block mt-1">
                    {formatLastMessageTime(group[0]?.sentAt)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}></div>
        </ScrollArea>
      </div>

      {/* Input Box fixed to the bottom */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center space-x-2 border-t p-4 bg-gray-900"
      >
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default ChatMessageList;
