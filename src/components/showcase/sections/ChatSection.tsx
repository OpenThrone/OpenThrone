import {
  Avatar,
  Button,
  Center,
  Group,
  Menu,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import ChatMembersPopover from '@/components/game/ChatMembersPopover';
import ChatMessageBody from '@/components/game/ChatMessageBody';
import ChatMessageGroupThemed from '@/components/game/ChatMessageGroupThemed';
import ChatMessageInputThemed from '@/components/game/ChatMessageInputThemed';
import ChatNotificationItems from '@/components/game/ChatNotificationItems';
import ChatRoomListThemed from '@/components/game/ChatRoomListThemed';
import styles from '@/components/game/ChatThemed.module.css';
import ChatTimeline from '@/components/game/ChatTimeline';
import MessageComposeDialog from '@/components/game/MessageComposeDialog';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import { useChatOutbox } from '@/hooks/useChatOutbox';
import type { ChatSendAcknowledgement, ChatSendPayload } from '@/types/chat';
import type { ChatMessage } from '@/types/typings';
import { mergeChatMessages } from '@/utils/chatDelivery';

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
  {
    richContent: {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Grukk hit our eastern holdings again. ' },
              {
                type: 'text',
                text: 'I am taking a war party at dusk.',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      },
    },
  },
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

const simulatedReply = (id?: number) => {
  const original = Object.values(CONVERSATIONS)
    .flat(2)
    .find((item) => item.id === id);
  return original
    ? { id: original.id, content: original.content, sender: original.sender }
    : null;
};
const OLDER_MESSAGE = message(
  1,
  THALIA,
  'Earlier dispatch: hold the river crossing until reinforcements arrive.',
  90,
  { id: 1000 },
);
const messageWithStableOlderId = () => OLDER_MESSAGE;

export default function ChatSection() {
  const { t } = useTranslation('messaging');
  const [selectedRoomId, setSelectedRoomId] = useState<number>(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>(['303']);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [groupName, setGroupName] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [deliveryMode, setDeliveryMode] = useState('success');
  const [simulatedMessages, setSimulatedMessages] = useState<ChatMessage[]>([]);
  const [olderLoaded, setOlderLoaded] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const firstUnreadMessageId = CONVERSATIONS[selectedRoomId]
    ?.flat()
    .find((item) => item.senderId !== ME.id)?.id;
  const jumpToOriginal = (id: number) => {
    const element = document.getElementById(`chat-message-${id}`);
    const viewport = scrollViewportRef.current;
    if (element && viewport) {
      viewport.scrollTop +=
        element.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        viewport.clientHeight / 2 +
        element.clientHeight / 2;
      element.dataset.highlight = 'true';
      element.focus({ preventScroll: true });
      setTimeout(() => element.removeAttribute('data-highlight'), 1600);
    }
  };
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(deliveryMode);
  modeRef.current = deliveryMode;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const savedMessages = useRef(new Map<string, ChatMessage>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const mockSocket = useMemo(
    () =>
      ({
        timeout: () => ({
          emit: (
            _event: string,
            payload: ChatSendPayload,
            acknowledge: (
              error: Error | null,
              result?: ChatSendAcknowledgement,
            ) => void,
          ) => {
            const mode = modeRef.current;
            const timer = setTimeout(() => {
              timers.current.delete(timer);
              if (mode === 'reject') {
                acknowledge(null, { ok: false, error: 'REJECTED' });
                return;
              }
              const saved =
                savedMessages.current.get(payload.clientMessageId) ??
                message(payload.roomId, ME, payload.content, 0, {
                  clientMessageId: payload.clientMessageId,
                  richContent: payload.richContent,
                  replyToMessage: simulatedReply(payload.replyToMessageId),
                });
              savedMessages.current.set(payload.clientMessageId, saved);
              if (mode === 'unconfirmed') {
                acknowledge(new Error('Simulated lost confirmation'));
                return;
              }
              setSimulatedMessages((previous) =>
                previous.some((item) => item.id === saved.id)
                  ? previous
                  : [...previous, saved],
              );
              acknowledge(null, { ok: true, message: saved });
            }, 800);
            timers.current.add(timer);
          },
        }),
      }) as unknown as Socket,
    [],
  );
  const baseMessages = useMemo(
    () => [
      ...(olderLoaded ? [messageWithStableOlderId()] : []),
      ...Object.values(CONVERSATIONS).flat(2),
      ...simulatedMessages,
    ],
    [olderLoaded, simulatedMessages],
  );
  const { outbox, send, retry } = useChatOutbox({
    socket: mockSocket,
    isConnected: deliveryMode !== 'offline',
    sender: ME,
    messages: baseMessages,
  });
  const timelineMessages = useMemo(
    () =>
      mergeChatMessages(
        baseMessages.filter((item) => item.roomId === selectedRoomId),
        outbox,
        selectedRoomId,
      ),
    [baseMessages, outbox, selectedRoomId],
  );
  const messageElementRefs = useRef<Map<number, HTMLElement>>(new Map());
  const room = ROOMS.find((r) => r.id === selectedRoomId);
  const groups = useMemo(
    () => timelineMessages.map((item) => [item]),
    [timelineMessages],
  );

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
      return (
        <ChatMessageBody content={msg.content} richContent={msg.richContent} />
      );
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
      description="The real chat composer, reply navigation, unread boundary, typing feedback, member roster and delivery outbox with an API-free simulated server. The labelled Share Attack Log button uses a mock action here; the live AttackLogShareModal loads participant reports on /messaging."
    >
      <Specimen
        framed={false}
        name="Messaging layout"
        usedOn={['/messaging']}
        note="Room list (alliance and direct rooms, unread counts) beside a conversation with reactions, a reply, read receipts and a shared battle report. Sending uses a simulated acknowledgement with pending, rejection, lost-confirmation and retry paths. Reactions and attachments use mock actions. The shared member roster opens without a live socket; administration remains in the live conversation."
        wide
      >
        <Group mb="md" align="flex-end">
          <Button
            variant="subtle"
            onClick={() => setShowTyping((value) => !value)}
          >
            Simulate typing
          </Button>
          <Select
            label="Simulated delivery"
            value={deliveryMode}
            onChange={(value) => setDeliveryMode(value ?? 'success')}
            allowDeselect={false}
            data={[
              { value: 'success', label: 'Confirm send' },
              { value: 'reject', label: 'Reject send' },
              { value: 'unconfirmed', label: 'Save, lose confirmation' },
              { value: 'offline', label: 'Disconnected' },
            ]}
          />
          <Button
            variant="outline"
            onClick={() =>
              setSimulatedMessages((previous) => [
                ...previous,
                message(
                  selectedRoomId,
                  THALIA,
                  'A new dispatch has arrived from the eastern watch.',
                  0,
                ),
              ])
            }
          >
            Simulate incoming message
          </Button>
        </Group>
        <div className={`${styles.chatLayout} ${styles.showcaseLayout}`}>
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
                styles={{
                  root: {
                    border: 0,
                    borderBottom: '1px solid var(--ot-line)',
                    boxShadow: 'none',
                  },
                }}
                withBorder={false}
              >
                <Group gap="xs" wrap="nowrap">
                  <Avatar size="md" radius="xl">
                    {(room?.name?.charAt(0) || '?').toUpperCase()}
                  </Avatar>
                  <Text fw={600} size="lg" className={styles.roomTitle}>
                    {room?.name || t('conversation.fallbackName')}
                  </Text>
                  {!room?.isDirect && (
                    <ChatMembersPopover
                      currentUserId={ME.id}
                      participants={[ME, THALIA, GRUKK].map((member) => ({
                        ...member,
                        role: member.id === ME.id ? 'ADMIN' : 'MEMBER',
                        canWrite: true,
                      }))}
                    />
                  )}
                </Group>
              </Paper>
              <ChatTimeline
                roomId={selectedRoomId}
                messages={timelineMessages}
                currentUserId={ME.id}
                viewportRef={scrollViewportRef}
                firstUnreadMessageId={firstUnreadMessageId}
                hasMore={selectedRoomId === 1 && !olderLoaded}
                onLoadOlder={() => setOlderLoaded(true)}
              >
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
                        onRetry={retry}
                        onJumpToMessage={jumpToOriginal}
                        firstUnreadMessageId={firstUnreadMessageId}
                        canRetry={deliveryMode !== 'offline'}
                      />
                    ))}
                  </Stack>
                )}
              </ChatTimeline>
              <Text role="status" size="xs" px="md" py={4} c="var(--ot-muted)">
                {deliveryMode === 'offline'
                  ? t('conversation.reconnecting')
                  : showTyping
                    ? t('conversation.typing', { names: THALIA.display_name })
                    : t('conversation.connected')}
              </Text>
              <ChatMessageInputThemed
                selectedRoomId={selectedRoomId}
                isConnected={deliveryMode !== 'offline'}
                onSendMessage={(nextDraft) => send(selectedRoomId, nextDraft)}
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
      <Specimen
        framed={false}
        name="Compose & notifications"
        usedOn={['/messaging', '/home', '/stats']}
        note="Real dialog and notification content with local data. Search and send never call the API. Both unread and caught-up states are available."
      >
        <Group>
          <Button onClick={() => setComposeOpen(true)}>
            {t('newMessage')}
          </Button>
          {[false, true].map((empty) => (
            <Menu
              key={String(empty)}
              width={320}
              position="bottom-start"
              withinPortal
            >
              <Menu.Target>
                <Button variant="outline">
                  {empty ? 'Notifications: caught up' : 'Notifications: unread'}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <div
                  onClickCapture={(event) => {
                    if ((event.target as HTMLElement).closest('a')) {
                      event.preventDefault();
                      event.stopPropagation();
                      mockAction('Open conversation')();
                    }
                  }}
                >
                  <ChatNotificationItems
                    messages={
                      empty
                        ? []
                        : [
                            {
                              id: 1,
                              senderName: THALIA.display_name,
                              content: 'Shared a battle report',
                              timestamp: minutesAgo(4),
                              chatRoomId: 1,
                            },
                          ]
                    }
                    onRoomSelect={mockAction('Open conversation')}
                  />
                </div>
              </Menu.Dropdown>
            </Menu>
          ))}
        </Group>
        <MessageComposeDialog
          opened={composeOpen}
          onClose={() => setComposeOpen(false)}
          title={t('newMessage')}
          onSubmit={mockAction('Send message')}
          availableUsers={[ME, THALIA, GRUKK].map((member) => ({
            value: String(member.id),
            label: member.display_name,
          }))}
          selectedUsers={selectedUsers}
          onUsersChange={setSelectedUsers}
          searchValue={search}
          onSearchChange={setSearch}
          message={draft}
          onMessageChange={setDraft}
          groupName={groupName}
          onGroupNameChange={setGroupName}
        />
      </Specimen>
    </ShowcaseSection>
  );
}
