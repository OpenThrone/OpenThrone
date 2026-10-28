import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type { ChatDraft, ChatSendPayload } from '@/types/chat';
import type { ChatMessage } from '@/types/typings';
import { chatPlainText, parseChatRichContent } from '@/utils/chatContent';
import {
  recoverChatOutbox,
  sendChatWithAcknowledgement,
} from '@/utils/chatDelivery';

interface OutboxEntry {
  payload: ChatSendPayload;
  message: ChatMessage;
}
let nextPendingId = -1;

export function useChatOutbox({
  socket,
  isConnected,
  sender,
  messages,
}: {
  socket: Socket | null;
  isConnected: boolean;
  sender?: ChatMessage['sender'];
  messages: ChatMessage[];
}) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [restoredFor, setRestoredFor] = useState<number | null>(null);
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let recovered: OutboxEntry[] = [];
    if (sender?.id) {
      try {
        recovered = recoverChatOutbox(
          JSON.parse(
            sessionStorage.getItem(`ot-chat-outbox:${sender.id}`) ?? '[]',
          ),
          sender,
        );
      } catch {
        /* Storage is optional; keep the in-memory outbox available. */
      }
    }
    setEntries(recovered);
    setRestoredFor(sender?.id ?? null);
    inFlight.current.clear();
  }, [sender?.id]);
  useEffect(() => {
    if (!sender?.id || restoredFor !== sender.id) return;
    try {
      const pending = entries
        .filter((entry) => entry.message.deliveryState)
        .map((entry) => ({
          payload: entry.payload,
          sentAt: entry.message.sentAt,
        }));
      if (pending.length)
        sessionStorage.setItem(
          `ot-chat-outbox:${sender.id}`,
          JSON.stringify(pending),
        );
      else sessionStorage.removeItem(`ot-chat-outbox:${sender.id}`);
    } catch {
      /* Private browsing or quota limits must not prevent sending. */
    }
  }, [entries, sender?.id, restoredFor]);
  useEffect(() => {
    const received = new Set(
      messages.map((message) => message.clientMessageId).filter(Boolean),
    );
    if (received.size)
      setEntries((previous) =>
        previous.filter(
          (entry) => !received.has(entry.payload.clientMessageId),
        ),
      );
  }, [messages]);

  const transmit = useCallback(
    async (payload: ChatSendPayload) => {
      if (
        !socket ||
        !isConnected ||
        inFlight.current.has(payload.clientMessageId)
      )
        return;
      inFlight.current.add(payload.clientMessageId);
      setEntries((previous) =>
        previous.map((entry) =>
          entry.payload.clientMessageId === payload.clientMessageId
            ? {
                ...entry,
                message: { ...entry.message, deliveryState: 'pending' },
              }
            : entry,
        ),
      );
      const result = await sendChatWithAcknowledgement(socket, payload);
      inFlight.current.delete(payload.clientMessageId);
      if (!mounted.current) return;
      setEntries((previous) =>
        previous.map((entry) => {
          if (entry.payload.clientMessageId !== payload.clientMessageId)
            return entry;
          return result?.ok
            ? {
                ...entry,
                message: { ...result.message, deliveryState: undefined },
              }
            : {
                ...entry,
                message: {
                  ...entry.message,
                  deliveryState: 'failed',
                  deliveryError: !result
                    ? 'unconfirmed'
                    : result.ok === false && result.error === 'RATE_LIMITED'
                      ? 'rateLimited'
                      : 'rejected',
                },
              };
        }),
      );
    },
    [socket, isConnected],
  );

  const send = useCallback(
    (roomId: number, draft: ChatDraft): boolean => {
      if (!sender?.id || !socket || !isConnected || !draft.content.trim())
        return false;
      let richContent: ChatDraft['richContent'];
      try {
        richContent = draft.richContent
          ? parseChatRichContent(draft.richContent)
          : undefined;
      } catch {
        return false;
      }
      const content = richContent
        ? chatPlainText(richContent.doc).trim()
        : draft.content.trim();
      const clientMessageId = crypto.randomUUID();
      const payload: ChatSendPayload = {
        roomId,
        content,
        richContent,
        clientMessageId,
        replyToMessageId: draft.replyToMessage?.id,
        messageType: draft.messageType ?? 'TEXT',
        sharedAttackLogId: draft.sharedAttackLogId,
      };
      const message: ChatMessage = {
        id: nextPendingId--,
        roomId,
        senderId: sender.id,
        sender,
        content,
        richContent,
        clientMessageId,
        messageType: payload.messageType,
        sentAt: new Date().toISOString(),
        deliveryState: 'pending',
        reactions: [],
        readBy: [],
        replyToMessage: draft.replyToMessage
          ? {
              id: draft.replyToMessage.id,
              content: draft.replyToMessage.content,
              sender: draft.replyToMessage.sender,
            }
          : null,
        sharedAttackLog: draft.sharedAttackLogId
          ? {
              id: draft.sharedAttackLogId,
              attacker_id: 0,
              defender_id: 0,
              winner: 0,
              timestamp: null,
            }
          : null,
      };
      setEntries((previous) => [...previous, { payload, message }]);
      transmit(payload);
      return true;
    },
    [sender, socket, isConnected, transmit],
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const entry = entries.find(
        (item) => item.payload.clientMessageId === clientMessageId,
      );
      if (entry?.message.deliveryState === 'failed') transmit(entry.payload);
    },
    [entries, transmit],
  );

  return { outbox: entries.map((entry) => entry.message), send, retry };
}
