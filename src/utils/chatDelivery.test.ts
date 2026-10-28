import { describe, expect, it } from 'bun:test';
import type { Socket } from 'socket.io-client';

import type { ChatSendPayload } from '@/types/chat';
import type { ChatMessage } from '@/types/typings';

import {
  mergeChatMessages,
  recoverChatOutbox,
  sendChatWithAcknowledgement,
} from './chatDelivery';

const payload: ChatSendPayload = {
  roomId: 42,
  content: 'Hold the bridge',
  clientMessageId: 'c594d592-1b36-4f50-b771-cb5bb1328b3e',
};
const message = {
  id: 12,
  roomId: 42,
  content: payload.content,
  clientMessageId: payload.clientMessageId,
  sentAt: '2026-10-24T00:00:00Z',
} as ChatMessage;

describe('chat delivery reconciliation', () => {
  it('retains the same idempotency key when retrying an unconfirmed send', async () => {
    const sent: ChatSendPayload[] = [];
    const socket = {
      timeout: () => ({
        emit: (
          _event: string,
          data: ChatSendPayload,
          ack: (error: Error | null, result?: unknown) => void,
        ) => {
          sent.push(data);
          if (sent.length === 1) ack(new Error('lost acknowledgement'));
          else ack(null, { ok: true, message });
        },
      }),
    } as unknown as Socket;
    expect(await sendChatWithAcknowledgement(socket, payload)).toBeNull();
    expect(await sendChatWithAcknowledgement(socket, payload)).toEqual({
      ok: true,
      message,
    });
    expect(sent.map((item) => item.clientMessageId)).toEqual([
      payload.clientMessageId,
      payload.clientMessageId,
    ]);
  });
  it('reconciles a broadcast arriving before the acknowledgement without duplicate bubbles', () => {
    const pending = { ...message, id: -1, deliveryState: 'pending' as const };
    expect(mergeChatMessages([message], [pending], 42)).toEqual([message]);
    expect(mergeChatMessages([message], [message], 42)).toEqual([message]);
    expect(mergeChatMessages([], [pending], 43)).toEqual([]);
  });
  it('keeps failed messages visible when server rejection or connection loss occurs', async () => {
    const socket = {
      timeout: () => ({
        emit: (
          _event: string,
          _data: unknown,
          ack: (error: null, result: unknown) => void,
        ) => ack(null, { ok: false, error: 'REJECTED' }),
      }),
    } as unknown as Socket;
    expect(await sendChatWithAcknowledgement(socket, payload)).toEqual({
      ok: false,
      error: 'REJECTED',
    });
    expect(
      mergeChatMessages(
        [],
        [{ ...message, id: -1, deliveryState: 'failed' }],
        42,
      )[0]?.content,
    ).toBe(payload.content);
  });
  it('recovers uncertain sends after reload using the active sender and the original retry key', () => {
    const sender = {
      id: 7,
      display_name: 'Sender',
      avatar: null,
      is_online: true,
    };
    const recovered = recoverChatOutbox(
      [
        { payload, sentAt: message.sentAt },
        {
          payload: { ...payload, clientMessageId: 'invalid' },
          sentAt: message.sentAt,
        },
      ],
      sender,
    );
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.payload.clientMessageId).toBe(payload.clientMessageId);
    expect(recovered[0]?.message).toMatchObject({
      senderId: 7,
      deliveryState: 'failed',
      deliveryError: 'unconfirmed',
      content: payload.content,
    });
    expect(recoverChatOutbox({ invalid: true }, sender)).toEqual([]);
  });
});
