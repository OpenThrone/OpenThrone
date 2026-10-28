import { Button, Space, Text } from '@mantine/core';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ChatMessageListThemed from '@/components/game/ChatMessageListThemed';
import ChatRoomListThemed from '@/components/game/ChatRoomListThemed';
import styles from '@/components/game/ChatThemed.module.css';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import NewMessageModal from '@/components/NewMessageModal';
import { useUser } from '@/context/users';
import useSocket from '@/hooks/useSocket';
import type {
  ChatMessage as FrontendMessage,
  FrontendRoom,
} from '@/types/typings';
import { logError, logInfo } from '@/utils/logger';

const MessageList = () => {
  const [rooms, setRooms] = useState<FrontendRoom[]>([]);
  const router = useRouter();
  const { data: session } = useSession();
  const { roomId: roomIdParam } = router.query;
  const previousRoomParam = useRef<number | null>(null);
  const { markRoomAsRead } = useUser();
  const { t } = useTranslation('messaging');

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<FrontendMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [browsingOriginal, setBrowsingOriginal] = useState(false);
  const [jumpError, setJumpError] = useState(false);
  const contextRoom = useRef<number | null>(null);
  const loadedRoom = useRef<number | null>(null);
  const roomHistory = useRef(
    new Map<number, { messages: FrontendMessage[]; hasMore: boolean }>(),
  );
  useEffect(() => {
    if (
      selectedRoomId &&
      loadedRoom.current === selectedRoomId &&
      !loadingMessages &&
      !browsingOriginal
    )
      roomHistory.current.set(selectedRoomId, { messages, hasMore });
  }, [selectedRoomId, messages, hasMore, loadingMessages, browsingOriginal]);
  const activeRoom = useRef(selectedRoomId);
  activeRoom.current = selectedRoomId;
  const historyRequest = useRef<AbortController | null>(null);
  const { isConnected } = useSocket(Number(session?.user?.id) || null);
  const routerRef = useRef(router);
  routerRef.current = router;

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) throw new Error(t('errorFetchingRooms'));
      const data: FrontendRoom[] = await response.json();
      setRooms(data);

      // Auto-select room based on URL param or first room *only if no room is currently selected*
      if (selectedRoomId === null) {
        // Check if a room isn't already selected
        let roomToSelect: number | null = null;
        const paramRoomId = roomIdParam ? Number(roomIdParam) : null;

        if (paramRoomId && data.some((room) => room.id === paramRoomId)) {
          // Select room from URL parameter if valid
          roomToSelect = paramRoomId;
        } else if (data.length > 0) {
          // Otherwise, select the first room in list
          roomToSelect = data[0].id;
        }

        // If we found a room to auto-select, update state
        if (roomToSelect !== null) {
          logInfo(`Auto-selecting room ${roomToSelect}`);
          setSelectedRoomId(roomToSelect);
          markRoomAsRead(roomToSelect);
        }
      }
    } catch (error) {
      logError(t('errorFetchingRooms'), error);
    }
  }, [roomIdParam, markRoomAsRead, selectedRoomId, t]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Opening a notification while already on /messaging must select its room.
  useEffect(() => {
    const id = Number(roomIdParam);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      previousRoomParam.current === id
    )
      return;
    if (!rooms.some((room) => room.id === id)) return;
    previousRoomParam.current = id;
    setSelectedRoomId(id);
    setMessages((previous) =>
      previous.filter((message) => message.roomId === id),
    );
  }, [roomIdParam, rooms]);

  useEffect(() => {
    const controller = new AbortController();
    historyRequest.current?.abort();
    historyRequest.current = null;
    setLoadingOlder(false);
    setHistoryError(false);
    setBrowsingOriginal(false);
    setJumpError(false);
    if (!selectedRoomId) {
      setMessages([]);
      setHasMore(false);
      return () => controller.abort();
    }
    const roomId = selectedRoomId;
    if (contextRoom.current !== null) {
      setMessages([]);
      contextRoom.current = null;
    }
    const cached = roomHistory.current.get(roomId);
    if (loadedRoom.current !== roomId) {
      setLoadingMessages(!cached);
      setMessages(cached?.messages ?? []);
      setHasMore(cached?.hasMore ?? false);
    }
    (async () => {
      try {
        const response = await fetch(`/api/messages/${roomId}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(t('errorFetchingMessages'));
        const data: FrontendMessage[] = await response.json();
        if (controller.signal.aborted) return;
        setMessages((previous) => {
          const byId = new Map(
            previous
              .filter((message) => message.roomId === roomId)
              .map((message) => [message.id, message]),
          );
          data.forEach((message) => byId.set(message.id, message));
          return [...byId.values()].sort((a, b) => a.id - b.id);
        });
        if (loadedRoom.current !== roomId && !cached)
          setHasMore(response.headers.get('X-Has-More') === 'true');
        loadedRoom.current = roomId;
        const currentRouter = routerRef.current;
        if (currentRouter.query.roomId !== String(roomId))
          currentRouter.replace(`/messaging?roomId=${roomId}`, undefined, {
            shallow: true,
          });
      } catch (error) {
        if (!controller.signal.aborted) {
          logError(t('errorFetchingMessages'), error);
          setHistoryError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingMessages(false);
      }
    })();
    return () => controller.abort();
  }, [selectedRoomId, isConnected, historyRevision, t]);

  const loadOlder = useCallback(async () => {
    const beforeId = messages[0]?.id;
    if (!selectedRoomId || !beforeId || loadingOlder || historyRequest.current)
      return;
    const roomId = selectedRoomId;
    const controller = new AbortController();
    historyRequest.current = controller;
    setLoadingOlder(true);
    setHistoryError(false);
    try {
      const response = await fetch(
        `/api/messages/${roomId}?beforeId=${beforeId}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(t('errorFetchingMessages'));
      const data: FrontendMessage[] = await response.json();
      if (controller.signal.aborted || activeRoom.current !== roomId) return;
      setMessages((previous) =>
        [
          ...new Map(
            [...data, ...previous].map((message) => [message.id, message]),
          ).values(),
        ].sort((a, b) => a.id - b.id),
      );
      setHasMore(response.headers.get('X-Has-More') === 'true');
    } catch (error) {
      if (!controller.signal.aborted) {
        logError(t('errorFetchingMessages'), error);
        setHistoryError(true);
      }
    } finally {
      if (historyRequest.current === controller) {
        historyRequest.current = null;
        setLoadingOlder(false);
      }
    }
  }, [messages, selectedRoomId, loadingOlder, t]);

  const jumpToMessage = useCallback(
    async (messageId: number) => {
      if (!selectedRoomId || historyRequest.current) return;
      const roomId = selectedRoomId;
      const controller = new AbortController();
      historyRequest.current = controller;
      setJumpError(false);
      setLoadingOlder(true);
      try {
        const response = await fetch(
          `/api/messages/${roomId}?aroundId=${messageId}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Original message unavailable');
        const data: FrontendMessage[] = await response.json();
        if (controller.signal.aborted || activeRoom.current !== roomId) return;
        setMessages(data);
        setHasMore(response.headers.get('X-Has-More') === 'true');
        setBrowsingOriginal(true);
      } catch (error) {
        if (!controller.signal.aborted) {
          setJumpError(true);
          logError('Reply navigation failed', error);
        }
      } finally {
        if (historyRequest.current === controller) {
          historyRequest.current = null;
          setLoadingOlder(false);
        }
      }
    },
    [selectedRoomId],
  );
  const returnToLatest = () => {
    if (selectedRoomId) roomHistory.current.delete(selectedRoomId);
    loadedRoom.current = null;
    setMessages([]);
    setHistoryRevision((value) => value + 1);
  };

  const handleRoomSelect = useCallback(
    (roomId: number) => {
      setSelectedRoomId(roomId);
      setMessages((previous) =>
        previous.filter((message) => message.roomId === roomId),
      );
      markRoomAsRead(roomId);
    },
    [markRoomAsRead],
  );

  return (
    <>
      {session?.user?.id && (
        <RealtimeMessageHandler
          userId={Number(session.user.id)}
          selectedRoomId={selectedRoomId}
          browsingOriginal={browsingOriginal}
          setMessages={setMessages}
          fetchRooms={fetchRooms} // Pass fetchRooms directly
          setRooms={setRooms}
        />
      )}
      <MessageListComponent
        rooms={rooms}
        setRooms={setRooms}
        selectedRoomId={selectedRoomId}
        setSelectedRoomId={handleRoomSelect}
        messages={messages}
        loadingMessages={loadingMessages}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        historyError={historyError}
        onRetryHistory={() => setHistoryRevision((value) => value + 1)}
        onJumpToMessage={jumpToMessage}
        browsingOriginal={browsingOriginal}
        onReturnToLatest={returnToLatest}
        jumpError={jumpError}
      />
    </>
  );
};

const MessageListComponent = ({
  rooms,
  setRooms,
  selectedRoomId,
  setSelectedRoomId,
  messages,
  loadingMessages,
  hasMore,
  loadingOlder,
  onLoadOlder,
  historyError,
  onRetryHistory,
  onJumpToMessage,
  browsingOriginal,
  onReturnToLatest,
  jumpError,
}: {
  rooms: FrontendRoom[];
  setRooms: React.Dispatch<React.SetStateAction<FrontendRoom[]>>;
  selectedRoomId: number | null;
  setSelectedRoomId: (id: number) => void;
  messages: FrontendMessage[];
  loadingMessages: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  historyError: boolean;
  onRetryHistory: () => void;
  onJumpToMessage: (id: number) => void;
  browsingOriginal: boolean;
  onReturnToLatest: () => void;
  jumpError: boolean;
}) => {
  const router = useRouter();
  const { t } = useTranslation('messaging');
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId],
  );
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const composeToUserId = useMemo(() => {
    const raw = router.query.composeToUserId;
    const id = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [router.query.composeToUserId]);
  const prefillRecipient = useMemo(() => {
    if (!composeToUserId) return null;
    const rawName = router.query.composeToName;
    const rawAvatar = router.query.composeToAvatar;
    const label = String(
      Array.isArray(rawName) ? rawName[0] : rawName || '',
    ).trim();
    const image = String(
      Array.isArray(rawAvatar) ? rawAvatar[0] : rawAvatar || '',
    ).trim();
    return {
      id: composeToUserId,
      label: label || t('user', { id: composeToUserId }),
      image: image || null,
    };
  }, [
    composeToUserId,
    router.query.composeToAvatar,
    router.query.composeToName,
    t,
  ]);

  useEffect(() => {
    if (!composeToUserId) return;
    setIsNewMessageModalOpen(true);
    router.replace('/messaging', undefined, { shallow: true });
  }, [composeToUserId, router]);

  const handleNewMessage = (newRoomId?: number) => {
    if (newRoomId) {
      setSelectedRoomId(newRoomId);
    }
    fetch('/api/messages')
      .then((res) => res.json())
      .then((data) => setRooms(data))
      .catch((err) => logError(t('errorRefetchingRooms'), err));
  };

  return (
    <MainArea title={t('title')}>
      <div className="p-4">
        <GameCard title={t('newMessage')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-300">
              {t('startConversation')}
            </div>
            <Button onClick={() => setIsNewMessageModalOpen(true)}>
              {t('compose')}
            </Button>
          </div>
        </GameCard>
      </div>
      {historyError && (
        <Text c="red" role="alert" mb="xs">
          {t('errorFetchingMessages')}{' '}
          <Button variant="subtle" size="compact-xs" onClick={onRetryHistory}>
            {t('message.retry')}
          </Button>
        </Text>
      )}
      {jumpError && (
        <Text role="alert" size="sm" mb="xs">
          {t('conversation.originalUnavailable')}
        </Text>
      )}
      {browsingOriginal && (
        <Button variant="subtle" size="xs" mb="xs" onClick={onReturnToLatest}>
          {t('conversation.returnToLatest')}
        </Button>
      )}
      <div className={styles.chatLayout}>
        <div className={`${styles.panel} ${styles.roomsPanel}`}>
          <ChatRoomListThemed
            rooms={rooms}
            onRoomSelect={setSelectedRoomId}
            selectedRoomId={selectedRoomId}
          />
        </div>
        <div className={`${styles.panel} ${styles.messagesPanel}`}>
          <ChatMessageListThemed
            selectedRoomId={selectedRoomId}
            messages={messages}
            roomInfo={selectedRoom}
            isLoading={loadingMessages}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
            onLoadOlder={onLoadOlder}
            onJumpToMessage={onJumpToMessage}
            onSentFromHistory={browsingOriginal ? onReturnToLatest : undefined}
          />
        </div>
      </div>
      <Space h="md" />
      <NewMessageModal
        opened={isNewMessageModalOpen}
        onClose={() => setIsNewMessageModalOpen(false)}
        onRoomCreated={handleNewMessage}
        prefillRecipient={prefillRecipient}
      />
    </MainArea>
  );
};

// Component to handle WebSocket logic separately
const RealtimeMessageHandler = ({
  userId,
  selectedRoomId,
  browsingOriginal,
  setMessages,
  setRooms,
  fetchRooms, // Receive fetchRooms prop
}: {
  userId: number;
  selectedRoomId: number | null;
  browsingOriginal: boolean;
  setMessages: React.Dispatch<React.SetStateAction<FrontendMessage[]>>;
  setRooms: React.Dispatch<React.SetStateAction<FrontendRoom[]>>;
  fetchRooms: () => Promise<void>; // Type fetchRooms prop
}) => {
  const { addEventListener, removeEventListener, socket, isConnected } =
    useSocket(userId);
  const { t } = useTranslation('messaging');
  useEffect(() => {
    if (!socket || !isConnected || !selectedRoomId) return;
    socket.emit('joinRoom', selectedRoomId);
    return () => {
      socket.emit('leaveRoom', selectedRoomId);
    };
  }, [socket, isConnected, selectedRoomId]);

  useEffect(() => {
    if (!socket || !userId || !isConnected) return;

    // --- Define Event Handlers ---
    const handleReceiveMessage = (messageData: FrontendMessage) => {
      logInfo(
        `[User ${userId}] handleReceiveMessage CALLED. Msg ID: ${messageData.id}, Msg Room: ${messageData.roomId}, Selected Room: ${selectedRoomId}`,
      );
      if (messageData.roomId === selectedRoomId && !browsingOriginal) {
        setMessages((prev) => {
          const optimisticIndex = prev.findIndex(
            (msg) => msg.isOptimistic && msg.tempId === messageData.tempId,
          );
          if (optimisticIndex > -1) {
            const newState = [...prev];
            newState[optimisticIndex] = { ...messageData, isOptimistic: false };
            return newState;
          }
          if (!prev.some((msg) => msg.id === messageData.id)) {
            return [...prev, { ...messageData, isOptimistic: false }];
          }
          return prev;
        });
      }
      setRooms((prevRooms) => {
        let roomUpdated = false;
        const updatedRooms = prevRooms.map((room) => {
          if (room.id === messageData.roomId) {
            roomUpdated = true;
            return {
              ...room,
              lastMessage:
                messageData.content.substring(0, 50) +
                (messageData.content.length > 50 ? '...' : ''),
              lastMessageTime: messageData.sentAt,
              lastMessageSender:
                messageData.sender?.display_name || t('unknown'),
              updatedAt: messageData.sentAt,
              unreadCount: room.unreadCount,
            };
          }
          return room;
        });
        if (!roomUpdated) {
          fetchRooms(); // Trigger full refresh if room wasn't found (edge case)
          return prevRooms;
        }
        return updatedRooms.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      });
    };

    const handleNewMessageNotification = (notificationData: any) => {
      logInfo('Received global notification:', notificationData);
      const roomId = Number(notificationData?.chatRoomId);
      if (!roomId) return;

      setRooms((prevRooms) => {
        let roomUpdated = false;
        const updatedRooms = prevRooms.map((room) => {
          if (room.id === roomId) {
            roomUpdated = true;
            const content = String(notificationData?.content || '');
            const timestamp = String(
              notificationData?.timestamp || new Date().toISOString(),
            );
            const unreadCount =
              roomId !== selectedRoomId &&
              Number(notificationData.senderId) !== userId
                ? (room.unreadCount || 0) + 1
                : room.unreadCount;

            return {
              ...room,
              lastMessage: content,
              lastMessageTime: timestamp,
              lastMessageSender: String(
                notificationData?.senderName ||
                  room.lastMessageSender ||
                  t('unknown'),
              ),
              updatedAt: timestamp,
              unreadCount,
            };
          }
          return room;
        });

        if (!roomUpdated) {
          fetchRooms();
          return prevRooms;
        }
        return updatedRooms.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      });
    };

    const handleReactionAdded = (data: {
      messageId: number;
      userId: number;
      reaction: string;
      userDisplayName: string;
    }) => {
      logInfo('Received reactionAdded:', data);
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === data.messageId) {
            const reactionExists = msg.reactions?.some(
              (r) => r.userId === data.userId && r.reaction === data.reaction,
            );
            if (!reactionExists) {
              const newReaction = {
                userId: data.userId,
                reaction: data.reaction,
                userDisplayName: data.userDisplayName,
              };
              return {
                ...msg,
                reactions: [...(msg.reactions || []), newReaction],
              };
            }
          }
          return msg;
        }),
      );
    };

    const handleReactionRemoved = (data: {
      messageId: number;
      userId: number;
      reaction: string;
    }) => {
      logInfo('Received reactionRemoved:', data);
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === data.messageId) {
            const updatedReactions = (msg.reactions || []).filter(
              (r) =>
                !(r.userId === data.userId && r.reaction === data.reaction),
            );
            return { ...msg, reactions: updatedReactions };
          }
          return msg;
        }),
      );
    };

    const handleMessagesRead = (data: {
      roomId: number;
      updates: { messageId: number; userId: number; readAt: string }[];
    }) => {
      logInfo('Received messagesRead:', data);
      if (data.updates.some((update) => update.userId === userId)) {
        fetchRooms();
      }
      if (data.roomId === selectedRoomId) {
        setMessages((prevMessages) =>
          prevMessages.map((msg) => {
            const readUpdate = data.updates.find(
              (update) => update.messageId === msg.id,
            );
            if (readUpdate) {
              const readerExists = msg.readBy?.some(
                (r) => r.userId === readUpdate.userId,
              );
              if (!readerExists) {
                const updatedReadBy = [...(msg.readBy || [])];
                updatedReadBy.push({
                  userId: readUpdate.userId,
                  readAt: readUpdate.readAt,
                  userDisplayName: t('reader') /* Placeholder */,
                });
                return { ...msg, readBy: updatedReadBy };
              }
            }
            return msg;
          }),
        );
      }
    };

    // --- Setup Listeners ---
    logInfo(
      `[User ${userId}] Setting up ALL message listeners for selectedRoomId: ${selectedRoomId}`,
    );
    addEventListener('receiveMessage', handleReceiveMessage);
    addEventListener('newMessageNotification', handleNewMessageNotification);
    addEventListener('reactionAdded', handleReactionAdded);
    addEventListener('reactionRemoved', handleReactionRemoved);
    addEventListener('messagesRead', handleMessagesRead);

    if (isConnected) {
      socket.emit('registerUser', { userId });
    }

    // --- Cleanup ---
    return () => {
      logInfo(
        `[User ${userId}] Cleaning up ALL message listeners for selectedRoomId: ${selectedRoomId}`,
      );
      removeEventListener('receiveMessage', handleReceiveMessage);
      removeEventListener(
        'newMessageNotification',
        handleNewMessageNotification,
      );
      removeEventListener('reactionAdded', handleReactionAdded);
      removeEventListener('reactionRemoved', handleReactionRemoved);
      removeEventListener('messagesRead', handleMessagesRead);
    };
  }, [
    socket,
    userId,
    selectedRoomId,
    browsingOriginal,
    isConnected,
    addEventListener,
    removeEventListener,
    fetchRooms,
    setMessages,
    setRooms,
    t,
  ]);

  return null;
};

export default MessageList;
