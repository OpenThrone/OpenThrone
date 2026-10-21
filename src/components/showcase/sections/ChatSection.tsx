import {
  Avatar,
  Button,
  Center,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useCallback, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import ChatMessageGroupThemed from '@/components/game/ChatMessageGroupThemed';
import ChatMessageInputThemed from '@/components/game/ChatMessageInputThemed';
import ChatRoomListThemed from '@/components/game/ChatRoomListThemed';
import styles from '@/components/game/ChatThemed.module.css';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import type { ChatMessage } from '@/types/typings';

const ME = {
  id: 101,
  display_name: 'Lady Morwen',
  avatar: null,
  is_online: true,
};
const GRUKK = {
  id: 202,
  display_name: 'Grukk the Vile',
  avatar: null,
  is_online: true,
};
const THALIA = {
  id: 303,
  display_name: 'Thalia Dawnspear',
  avatar: null,
  is_online: false,
};

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const ROOMS = [
  {
    id: 1,
    name: 'Silver Court',
    isDirect: false,
    lastMessage: 'Shared a battle report',
    lastMessageTime: minutesAgo(4),
    lastMessageSender: THALIA.display_name,
    unreadCount: 3,
  },
  {
    id: 2,
    name: GRUKK.display_name,
    isDirect: true,
    lastMessage: 'Fine. Truce until the next era.',
    lastMessageTime: minutesAgo(38),
    lastMessageSender: GRUKK.display_name,
    unreadCount: 0,
  },
  {
    id: 3,
    name: 'War council',
    isDirect: false,
    lastMessage: 'Strike at turn change.',
    lastMessageTime: minutesAgo(60 * 30),
    lastMessageSender: ME.display_name,
    unreadCount: 12,
  },
  {
    id: 4,
    name: null,
    isDirect: true,
    lastMessage: null,
    lastMessageTime: null,
    lastMessageSender: null,
    unreadCount: 0,
  },
];

let nextId = 9000;
const message = (
  roomId: number,
  sender: ChatMessage['sender'],
  content: string,
  minutes: number,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: (nextId += 1),
  roomId,
  senderId: sender.id,
  content,
  messageType: 'TEXT',
  sentAt: minutesAgo(minutes),
  sender,
  reactions: [],
  readBy: [],
  replyToMessage: null,
  sharedAttackLog: null,
  ...extra,
});

const ORDERS = message(
  1,
  ME,
  'Grukk hit our eastern holdings again. I am taking a war party at dusk.',
  14,
);

/** Messages per room, already grouped by consecutive sender as the list does. */
const CONVERSATIONS: Record<number, ChatMessage[][]> = {
  1: [
    [
      message(
        1,
        THALIA,
        'Sentries report goblin scouts on the river road.',
        22,
      ),
      message(1, THALIA, 'Twice since moonrise.', 21, {
        reactions: [
          { userId: ME.id, reaction: '👍', userDisplayName: ME.display_name },
          { userId: 404, reaction: '👍', userDisplayName: 'Brannoc' },
          { userId: 405, reaction: '😮', userDisplayName: 'Ysolde' },
        ],
      }),
    ],
    [
      ORDERS,
      message(1, ME, 'Keep your sentries doubled until I return.', 13, {
        readBy: [
          {
            userId: THALIA.id,
            readAt: minutesAgo(12),
            userDisplayName: THALIA.display_name,
          },
          { userId: 404, readAt: minutesAgo(11), userDisplayName: 'Brannoc' },
        ],
      }),
    ],
    [
      message(1, THALIA, 'Aye. Here is what we learned last night.', 5, {
        replyToMessage: {
          id: ORDERS.id,
          content: ORDERS.content,
          sender: { id: ME.id, display_name: ME.display_name },
        },
      }),
      message(1, THALIA, 'Shared a battle report', 4, {
        messageType: 'ATTACK_LOG_SHARE',
        sharedAttackLog: {
          id: 48213,
          attacker_id: ME.id,
          defender_id: GRUKK.id,
          winner: ME.id,
          timestamp: minutesAgo(600),
        },
        reactions: [
          { userId: ME.id, reaction: '❤️', userDisplayName: ME.display_name },
        ],
      }),
    ],
  ],
  2: [
    [message(2, ME, 'Your raids cost us dearly, Grukk.', 45)],
    [
      message(2, GRUKK, 'You started it.', 41),
      message(2, GRUKK, 'Fine. Truce until the next era.', 38),
    ],
  ],
};

/**
 * Stands in for the socket.io client. It never connects; the input only
 * calls emit, so the rest of the Socket surface is left out on purpose.
 */
const MOCK_SOCKET = {
  connected: false,
  emit: (event: string, payload: { content?: string }) => {
    mockAction(`${event}: "${payload?.content ?? ''}"`)();
    return MOCK_SOCKET;
  },
  on: () => MOCK_SOCKET,
  off: () => MOCK_SOCKET,
} as unknown as Socket;

export default function ChatSection() {
  const { t } = useTranslation('messaging');
  const [selectedRoomId, setSelectedRoomId] = useState<number>(1);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const messageElementRefs = useRef<Map<number, HTMLElement>>(new Map());
  const room = ROOMS.find((r) => r.id === selectedRoomId);
  const groups = CONVERSATIONS[selectedRoomId] ?? [];

  // Same rendering as ChatMessageListThemed: shared reports become a link button.
  const renderMessageContent = useCallback(
    (msg: ChatMessage) => {
      if (msg.messageType === 'ATTACK_LOG_SHARE' && msg.sharedAttackLog) {
        const logId = msg.sharedAttackLog.id;
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
      return msg.content;
    },
    [t],
  );

  const toggleReaction = useCallback(
    (messageId: number, reaction: string) =>
      mockAction(`toggleReaction ${reaction} on message ${messageId}`)(),
    [],
  );

  return (
    <ShowcaseSection
      id="chat"
      title="Chat & messaging"
      description="The themed room list, message groups and composer from /messaging, wired to mock rooms and a socket that never connects."
    >
      <Specimen
        framed={false}
        name="Messaging layout"
        usedOn={['/messaging']}
        note="Room list (alliance and direct rooms, unread counts) beside a conversation with reactions, a reply, read receipts and a shared battle report. Sending, reacting and attaching emit mock actions. The conversation header and member management live inside ChatMessageListThemed, which needs a live socket, so a minimal header stands in."
        wide
      >
        <div className={styles.chatLayout} style={{ height: 640 }}>
          <div className={`${styles.panel} ${styles.roomsPanel}`}>
            <ChatRoomListThemed
              rooms={ROOMS}
              selectedRoomId={selectedRoomId}
              onRoomSelect={(id) => {
                setSelectedRoomId(id);
                setReplyingTo(null);
              }}
            />
          </div>
          <div className={`${styles.panel} ${styles.messagesPanel}`}>
            <div className="flex h-full flex-col overflow-hidden">
              <Paper
                p="md"
                className={styles.messagesHeader}
                withBorder={false}
              >
                <Group gap="xs">
                  <Avatar size="md" radius="xl">
                    {(room?.name?.charAt(0) || '?').toUpperCase()}
                  </Avatar>
                  <Text fw={600} size="lg" className={styles.roomTitle}>
                    {room?.name || t('conversation.fallbackName')}
                  </Text>
                </Group>
              </Paper>
              <div className="flex-1 overflow-hidden">
                <ScrollArea className={styles.messageArea} type="auto" h="100%">
                  {groups.length === 0 ? (
                    <Center py="xl">
                      <Text c="dimmed">{t('conversation.empty')}</Text>
                    </Center>
                  ) : (
                    <Stack gap="lg" py="md">
                      {groups.map((group) => (
                        <ChatMessageGroupThemed
                          key={group[0].id}
                          group={group}
                          isCurrentUser={group[0].senderId === ME.id}
                          currentUserId={ME.id}
                          handleToggleReaction={toggleReaction}
                          setReplyingToMessage={setReplyingTo}
                          renderMessageContent={renderMessageContent}
                          messageElementRefs={messageElementRefs}
                        />
                      ))}
                    </Stack>
                  )}
                </ScrollArea>
              </div>
              <ChatMessageInputThemed
                selectedRoomId={selectedRoomId}
                socket={MOCK_SOCKET}
                isConnected
                currentUserId={ME.id}
                markRoomAsRead={() => undefined}
                replyingToMessage={replyingTo}
                setReplyingToMessage={setReplyingTo}
                setIsShareModalOpen={mockAction(
                  'Open share battle report dialog',
                )}
                canWrite
              />
            </div>
          </div>
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}
