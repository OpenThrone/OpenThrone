import type { Socket } from 'socket.io-client';
import { z } from 'zod';

import type { ChatSendAcknowledgement, ChatSendPayload } from '@/types/chat';
import type { ChatMessage } from '@/types/typings';
import {
  CHAT_MAX_LENGTH,
  chatPlainText,
  parseChatRichContent,
} from '@/utils/chatContent';

export const CHAT_ACK_TIMEOUT_MS = 10000;

/** A timeout means unconfirmed, not unsaved. Retrying must reuse clientMessageId. */
export function sendChatWithAcknowledgement(
  socket: Socket,
  payload: ChatSendPayload,
): Promise<ChatSendAcknowledgement | null> {
  return new Promise((resolve) => {
    try {
      socket
        .timeout(CHAT_ACK_TIMEOUT_MS)
        .emit(
          'sendMessage',
          payload,
          (error: Error | null, result: ChatSendAcknowledgement) => {
            if (error || !result || typeof result.ok !== 'boolean')
              resolve(null);
            else resolve(result);
          },
        );
    } catch {
      resolve(null);
    }
  });
}

export function mergeChatMessages(
  messages: ChatMessage[],
  outbox: ChatMessage[],
  roomId: number | null,
): ChatMessage[] {
  const ids = new Set(messages.map((message) => message.id));
  const clientIds = new Set(
    messages.map((message) => message.clientMessageId).filter(Boolean),
  );
  return [
    ...messages.filter((message) => message.roomId === roomId),
    ...outbox.filter(
      (message) =>
        message.roomId === roomId &&
        !ids.has(message.id) &&
        !clientIds.has(message.clientMessageId),
    ),
  ].sort(
    (a, b) =>
      new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() ||
      a.id - b.id,
  );
}

const storedEntrySchema = z.object({
  payload: z.object({
    roomId: z.number().int().positive(),
    content: z.string().min(1).max(CHAT_MAX_LENGTH),
    clientMessageId: z.string().uuid(),
    richContent: z.unknown().optional(),
    replyToMessageId: z.number().int().positive().optional(),
    messageType: z.enum(['TEXT', 'ATTACK_LOG_SHARE']).optional(),
    sharedAttackLogId: z.number().int().positive().optional(),
  }),
  sentAt: z.string().datetime(),
});

/** Recover uncertain sends on reload, scoped to the active player's browser session. */
export function recoverChatOutbox(
  value: unknown,
  sender: ChatMessage['sender'],
): { payload: ChatSendPayload; message: ChatMessage }[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-100).flatMap((raw, index) => {
    try {
      const parsed = storedEntrySchema.parse(raw);
      const richContent = parsed.payload.richContent
        ? parseChatRichContent(parsed.payload.richContent)
        : undefined;
      const payload: ChatSendPayload = {
        ...parsed.payload,
        roomId: parsed.payload.roomId,
        clientMessageId: parsed.payload.clientMessageId,
        content: richContent
          ? chatPlainText(richContent.doc).trim()
          : parsed.payload.content,
        richContent,
      };
      const message: ChatMessage = {
        id: -100000 - index,
        roomId: payload.roomId,
        senderId: sender.id,
        sender,
        content: payload.content,
        richContent,
        clientMessageId: payload.clientMessageId,
        messageType: payload.messageType ?? 'TEXT',
        sentAt: parsed.sentAt,
        deliveryState: 'failed',
        deliveryError: 'unconfirmed',
        reactions: [],
        readBy: [],
        replyToMessage: null,
        sharedAttackLog: payload.sharedAttackLogId
          ? {
              id: payload.sharedAttackLogId,
              attacker_id: 0,
              defender_id: 0,
              winner: 0,
              timestamp: null,
            }
          : null,
      };
      return [{ payload, message }];
    } catch {
      return [];
    }
  });
}
