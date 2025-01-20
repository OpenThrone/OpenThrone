import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import { useUser } from '@/context/users';
import { Indicator, Avatar, Text, Alert, ScrollArea } from '@mantine/core';
import MainArea from '@/components/MainArea';

const MessageDetail = (props) => {
  const router = useRouter();
  const { roomid } = router.query;
  const { user } = useUser();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [hasAccess, setHasAccess] = useState(true); // Track access
  const bottomRef = useRef(null);

  const fetchMessages = async (roomid) => {
    if (!roomid) return;
    try {
      const response = await fetch(`/api/messages/${roomid}`);
      if (response.status === 403) {
        setHasAccess(false); // User does not have access
        setMessages([]);
      } else if (response.ok) {
        const data = await response.json();
        setMessages(data);
      } else {
        console.error('Unexpected response:', response.status);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setHasAccess(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMessages(roomid);
      setCurrentUserId(user.id);
    }
  }, [user, roomid]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !hasAccess) return;

    await fetch(`/api/messages/${roomid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMessage }),
    });
    setNewMessage('');
    fetchMessages(roomid);
  };

  const formatTimestamp = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isConsecutive = (prev, current) => {
    if (!prev) return false;
    return (
      prev.senderId === current.senderId &&
      new Date(current.sentAt) - new Date(prev.sentAt) < 60000
    );
  };

  const groupedMessages = useMemo(() => {
    if (!Array.isArray(messages)) return [];
    const groups = [];
    let currentGroup = [];

    messages.forEach((message, index) => {
      const previousMessage = messages[index - 1];
      if (isConsecutive(previousMessage, message)) {
        currentGroup.push(message);
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [message];
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    return groups;
  }, [messages]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [groupedMessages]);

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-4 h-screen flex flex-col items-center justify-center">
        <Alert title="Access Denied" color="red">
          You do not have permission to view this chat room. Please contact the admin for access.
        </Alert>
      </div>
    );
  }

  return (
    <MainArea title="Chat Room">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-4">
        <ScrollArea className='h-full' >
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
                  <Text className="text-sm font-bold">{group[0]?.sender?.display_name}</Text>
                )}
                {group.map((message) => (
                  <Text key={message.id}>{message.content}</Text>
                ))}
                <span className="text-xs text-gray-500 block mt-1">
                  {formatTimestamp(group[0]?.sentAt)}
                </span>
              </div>
            </div>
          );
        })}
          </ScrollArea>
        <div ref={bottomRef}></div>
      </div>

      {/* Input Box */}
      <div className="flex items-center space-x-2 mt-4">
        <textarea
          className="flex-1 p-2 border rounded"
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          disabled={!hasAccess}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={sendMessage}
          disabled={!hasAccess}
        >
          Send
        </button>
      </div>
    </MainArea>
  );
};

export default MessageDetail;
