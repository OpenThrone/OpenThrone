import { Button, Center, ScrollArea } from '@mantine/core';
import { useIsomorphicEffect } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';

import type { ChatMessage } from '@/types/typings';

import styles from './ChatThemed.module.css';

interface ChatTimelineProps {
  roomId: number | null;
  messages: ChatMessage[];
  currentUserId?: number;
  viewportRef: RefObject<HTMLDivElement>;
  firstUnreadMessageId?: number | null;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  children: ReactNode;
}

/** Own the scroll viewport only: message updates never scroll the whole page. */
export default function ChatTimeline({
  roomId,
  messages,
  currentUserId,
  viewportRef,
  firstUnreadMessageId,
  hasMore,
  loadingOlder,
  onLoadOlder,
  children,
}: ChatTimelineProps) {
  const { t } = useTranslation('messaging');
  const nearBottom = useRef(true);
  const readingPositions = useRef(
    new Map<number, { id: number; offset: number; bottom: boolean }>(),
  );
  const positionedUnreadRoom = useRef<number | null>(null);
  const restoredRoom = useRef<number | null>(null);
  const previous = useRef<{
    roomId: number | null;
    firstId?: number;
    lastId?: number;
    height: number;
    top: number;
  } | null>(null);
  const [newCount, setNewCount] = useState(0);
  const jumpToLatest = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
    nearBottom.current = true;
    setNewCount(0);
  }, [viewportRef]);

  useIsomorphicEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;
    const old = previous.current;
    if (
      !old ||
      old.roomId !== roomId ||
      (old.firstId === undefined && firstId !== undefined)
    ) {
      restoredRoom.current = null;
      setNewCount(0);
      const saved = roomId ? readingPositions.current.get(roomId) : null;
      const anchor =
        saved &&
        viewport.querySelector<HTMLElement>(`[data-message-id="${saved.id}"]`);
      if (anchor && !saved.bottom) {
        viewport.scrollTop +=
          anchor.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          saved.offset;
        nearBottom.current = false;
        restoredRoom.current = roomId;
      } else jumpToLatest();
      positionedUnreadRoom.current = null;
    } else if (
      firstId !== undefined &&
      old.firstId !== undefined &&
      firstId < old.firstId &&
      firstId > 0
    ) {
      viewport.scrollTop = old.top + viewport.scrollHeight - old.height;
    } else if (lastId !== old.lastId && messages.length) {
      const last = messages[messages.length - 1];
      if (nearBottom.current || last.senderId === currentUserId) jumpToLatest();
      else {
        const oldLastIndex = messages.findIndex(
          (message) => message.id === old.lastId,
        );
        // A confirmation swaps a temporary id; it is not a newly received message.
        if (oldLastIndex >= 0)
          setNewCount(
            (count) =>
              count +
              messages
                .slice(oldLastIndex + 1)
                .filter((message) => message.senderId !== currentUserId).length,
          );
      }
    }
    previous.current = {
      roomId,
      firstId,
      lastId,
      height: viewport.scrollHeight,
      top: viewport.scrollTop,
    };
  }, [roomId, messages, currentUserId, jumpToLatest, viewportRef]);

  useIsomorphicEffect(() => {
    if (
      !roomId ||
      !firstUnreadMessageId ||
      positionedUnreadRoom.current === roomId ||
      restoredRoom.current === roomId
    )
      return;
    const viewport = viewportRef.current;
    const unread = viewport?.querySelector<HTMLElement>(
      `[data-message-id="${firstUnreadMessageId}"]`,
    );
    if (!viewport || !unread) return;
    viewport.scrollTop +=
      unread.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top -
      40;
    nearBottom.current =
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 72;
    positionedUnreadRoom.current = roomId;
  }, [roomId, firstUnreadMessageId, messages, viewportRef]);

  return (
    <div className={styles.timeline}>
      <ScrollArea
        viewportRef={viewportRef}
        className={styles.messageArea}
        type="auto"
        h="100%"
        onScrollPositionChange={({ y }) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          nearBottom.current =
            viewport.scrollHeight - viewport.clientHeight - y < 72;
          if (nearBottom.current) setNewCount(0);
          if (roomId) {
            const { top } = viewport.getBoundingClientRect();
            const anchor = [
              ...viewport.querySelectorAll<HTMLElement>('[data-message-id]'),
            ].find((element) => element.getBoundingClientRect().bottom > top);
            if (anchor)
              readingPositions.current.set(roomId, {
                id: Number(anchor.dataset.messageId),
                offset: anchor.getBoundingClientRect().top - top,
                bottom: nearBottom.current,
              });
          }
          if (previous.current)
            previous.current = {
              ...previous.current,
              top: y,
              height: viewport.scrollHeight,
            };
        }}
      >
        {hasMore && (
          <Center py="xs">
            <Button
              variant="subtle"
              size="xs"
              loading={loadingOlder}
              onClick={onLoadOlder}
            >
              {t('conversation.loadOlder')}
            </Button>
          </Center>
        )}
        {children}
      </ScrollArea>
      {newCount > 0 && (
        <Button
          className={styles.newMessagesButton}
          size="xs"
          onClick={jumpToLatest}
        >
          {t('conversation.newMessages', { count: newCount })}
        </Button>
      )}
    </div>
  );
}
