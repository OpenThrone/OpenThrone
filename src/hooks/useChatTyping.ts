import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

type TypingUpdate = {
  roomId: number;
  userId: number;
  displayName: string;
  isTyping: boolean;
};

const TYPING_EXPIRY_MS = 5000;
const START_THROTTLE_MS = 1200;
const IDLE_STOP_MS = 3000;

/** Handles ephemeral room typing presence; message content is never sent. */
export default function useChatTyping(
  socket: Socket | null,
  roomId: number | null,
  currentUserId: number | null,
  enabled: boolean,
) {
  const [typingUsers, setTypingUsers] = useState<Record<number, string>>({});
  const expiryTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const typingRef = useRef(false);
  const lastStartAt = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket || !roomId || !enabled) return;
      if (isTyping) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
          idleTimer.current = null;
          if (!typingRef.current) return;
          typingRef.current = false;
          socket.emit('chatTyping', { roomId, isTyping: false });
        }, IDLE_STOP_MS);
        const now = Date.now();
        if (typingRef.current && now - lastStartAt.current < START_THROTTLE_MS)
          return;
        typingRef.current = true;
        lastStartAt.current = now;
      } else {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = null;
        if (!typingRef.current) return;
        typingRef.current = false;
      }
      socket.emit('chatTyping', { roomId, isTyping });
    },
    [enabled, roomId, socket],
  );

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') onTyping(false);
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () =>
      document.removeEventListener('visibilitychange', stopWhenHidden);
  }, [enabled, onTyping]);

  useEffect(() => {
    if (!socket || !roomId || !enabled) {
      setTypingUsers({});
      return;
    }

    const handleUpdate = (update: TypingUpdate) => {
      if (
        !update ||
        update.roomId !== roomId ||
        update.userId === currentUserId ||
        !Number.isSafeInteger(update.userId)
      )
        return;
      const oldTimer = expiryTimers.current.get(update.userId);
      if (oldTimer) clearTimeout(oldTimer);
      if (!update.isTyping) {
        expiryTimers.current.delete(update.userId);
        setTypingUsers((users) => {
          const next = { ...users };
          delete next[update.userId];
          return next;
        });
        return;
      }

      setTypingUsers((users) => ({
        ...users,
        [update.userId]: update.displayName,
      }));
      expiryTimers.current.set(
        update.userId,
        setTimeout(() => {
          expiryTimers.current.delete(update.userId);
          setTypingUsers((users) => {
            const next = { ...users };
            delete next[update.userId];
            return next;
          });
        }, TYPING_EXPIRY_MS),
      );
    };

    socket.on('chatTypingUpdate', handleUpdate);
    return () => {
      socket.off('chatTypingUpdate', handleUpdate);
      if (typingRef.current)
        socket.emit('chatTyping', { roomId, isTyping: false });
      typingRef.current = false;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = null;
      expiryTimers.current.forEach(clearTimeout);
      expiryTimers.current.clear();
      setTypingUsers({});
    };
  }, [currentUserId, enabled, roomId, socket]);

  return { typingNames: Object.values(typingUsers), onTyping };
}
