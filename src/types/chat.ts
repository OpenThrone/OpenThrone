import type { ChatMessage } from '@/types/typings';
import type { ChatRichContent } from '@/utils/chatContent';

export interface ChatSendPayload {
  roomId: number;
  content: string;
  richContent?: ChatRichContent;
  clientMessageId: string;
  replyToMessageId?: number;
  messageType?: 'TEXT' | 'ATTACK_LOG_SHARE';
  sharedAttackLogId?: number;
}
export type ChatSendAcknowledgement =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: 'RATE_LIMITED' | 'REJECTED' };
export interface ChatDraft {
  content: string;
  richContent?: ChatRichContent;
  replyToMessage?: ChatMessage | null;
  messageType?: 'TEXT' | 'ATTACK_LOG_SHARE';
  sharedAttackLogId?: number;
}
