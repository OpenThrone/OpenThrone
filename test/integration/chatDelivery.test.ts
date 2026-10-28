import { createServer } from 'node:http';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

import prisma from '@/lib/prisma';
import {
  handleChatTyping,
  handleJoinRoom,
  handleSendMessage,
} from '@/lib/socket';
import {
  MessagingService,
  serializeChatMessage,
} from '@/services/Messaging.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { createUser } from '@/services/User.service';
import type { ChatSendAcknowledgement } from '@/types/chat';
import type { ChatRichContent } from '@/utils/chatContent';

import { resetDatabase } from './db';

let senderId: number;
let outsiderId: number;
let roomId: number;
const clientMessageId = '42e57b49-3498-411e-b0c7-ea472df34911';
const richContent: ChatRichContent = {
  version: 1,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hold the bridge', marks: [{ type: 'bold' }] },
        ],
      },
    ],
  },
};

beforeEach(async () => {
  await resetDatabase();
  senderId = (
    await createUser(
      'sender@example.test',
      'synthetic-hash',
      'Sender',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  outsiderId = (
    await createUser(
      'outsider@example.test',
      'synthetic-hash',
      'Outsider',
      'HUMAN',
      'FIGHTER',
    )
  ).id;
  await prisma.serverSetting.create({
    data: {
      key: 'ENABLE_MESSAGING',
      value: true,
      label: 'Messaging',
      type: 'BOOLEAN',
    },
  });
  invalidateRuntimeConfigCache();
  const room = await prisma.chatRoom.create({
    data: {
      createdById: senderId,
      name: 'Test room',
      participants: {
        create: { userId: senderId, canWrite: true, role: 'ADMIN' },
      },
    },
  });
  roomId = room.id;
});

describe('durable chat delivery with PostgreSQL', () => {
  test('concurrent retries commit one rich message and return the same server id', async () => {
    const messages = await Promise.all(
      Array.from({ length: 8 }, () =>
        MessagingService.sendMessageRealtime(senderId, {
          roomId,
          clientMessageId,
          content: 'Untrusted preview',
          richContent,
        }),
      ),
    );
    expect(new Set(messages.map((message) => message.id)).size).toBe(1);
    expect(messages.filter((message) => message.deduplicated)).toHaveLength(7);
    expect(await prisma.chatMessage.count()).toBe(1);
    const stored = await prisma.chatMessage.findFirstOrThrow();
    expect(stored.content).toBe('Hold the bridge');
    expect(stored.richContent).toEqual(richContent);
    expect(serializeChatMessage(messages[0]).richContent).toEqual(richContent);
  });
  test('Socket.IO retries recover a deliberately lost acknowledgement without rebroadcasting', async () => {
    const http = createServer();
    const server = new Server(http);
    let attempts = 0;
    server.on('connection', (socket) => {
      socket.join(`room-${roomId}`);
      // Synthetic authenticated identity; handshake auth has its own account-guard tests.
      socket.on('sendMessage', (payload, acknowledge) => {
        attempts += 1;
        handleSendMessage(
          socket,
          senderId,
          payload,
          attempts === 1 ? undefined : acknowledge,
        );
      });
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test server port');
    const url = `http://127.0.0.1:${address.port}`;
    const sender = connect(url, { transports: ['websocket'] });
    const subscriber = connect(url, { transports: ['websocket'] });
    try {
      await Promise.all(
        [sender, subscriber].map(
          (client) =>
            new Promise<void>((resolve) => client.on('connect', resolve)),
        ),
      );
      const received: number[] = [];
      const firstMessage = new Promise<void>((resolve) =>
        subscriber.on('receiveMessage', (message) => {
          received.push(message.id);
          resolve();
        }),
      );
      const payload = {
        roomId,
        clientMessageId,
        content: 'preview',
        richContent,
      };
      await expect(
        sender.timeout(400).emitWithAck('sendMessage', payload),
      ).rejects.toThrow();
      await firstMessage;
      const result = (await sender
        .timeout(2000)
        .emitWithAck('sendMessage', payload)) as ChatSendAcknowledgement;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message.id).toBe(received[0]);
        expect(result.message.content).toBe('Hold the bridge');
        expect(result.message.richContent).toEqual(richContent);
      }
      expect(attempts).toBe(2);
      expect(received).toHaveLength(1);
      expect(await prisma.chatMessage.count()).toBe(1);
    } finally {
      sender.disconnect();
      subscriber.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  test('typing is room-authorized, write-gated, transient, and uses server identity', async () => {
    const recipientId = (
      await createUser(
        'recipient@example.test',
        'synthetic-hash',
        'Recipient',
        'HUMAN',
        'FIGHTER',
      )
    ).id;
    const readerId = (
      await createUser(
        'reader@example.test',
        'synthetic-hash',
        'Reader',
        'HUMAN',
        'FIGHTER',
      )
    ).id;
    await prisma.chatRoomParticipant.createMany({
      data: [
        { roomId, userId: recipientId, canWrite: true },
        { roomId, userId: readerId, canWrite: false },
      ],
    });

    const http = createServer();
    const server = new Server(http);
    server.on('connection', (socket) => {
      const userId = Number(socket.handshake.auth.userId);
      socket.on('joinRoom', async (joinedRoomId) => {
        await handleJoinRoom(socket, userId, joinedRoomId);
      });
      socket.on('chatTyping', async (payload) => {
        await handleChatTyping(socket, userId, payload);
      });
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test server port');
    const url = `http://127.0.0.1:${address.port}`;
    const sender = connect(url, {
      transports: ['websocket'],
      auth: { userId: senderId },
    });
    const reader = connect(url, {
      transports: ['websocket'],
      auth: { userId: readerId },
    });
    const outsider = connect(url, {
      transports: ['websocket'],
      auth: { userId: outsiderId },
    });
    const recipient = connect(url, {
      transports: ['websocket'],
      auth: { userId: recipientId },
    });
    const connected = (client: typeof sender) =>
      new Promise<void>((resolve) => client.once('connect', resolve));
    const joined = (client: typeof sender) => {
      const result = new Promise<void>((resolve, reject) => {
        client.once('joinedRoom', () => resolve());
        client.once('joinRoomError', (error) => reject(error));
      });
      client.emit('joinRoom', roomId);
      return result;
    };
    const received: unknown[] = [];
    let senderReceived = false;
    recipient.on('chatTypingUpdate', (update) => received.push(update));
    sender.on('chatTypingUpdate', () => {
      senderReceived = true;
    });
    try {
      await Promise.all([sender, reader, outsider, recipient].map(connected));
      await Promise.all([joined(sender), joined(reader), joined(recipient)]);

      // A non-member cannot announce presence, and a read-only participant is
      // allowed to receive typing but cannot publish it.
      outsider.emit('chatTyping', { roomId, isTyping: true });
      reader.emit('chatTyping', { roomId, isTyping: true });
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(received).toHaveLength(0);

      const validTyping = new Promise<unknown>((resolve) =>
        recipient.once('chatTypingUpdate', resolve),
      );
      sender.emit('chatTyping', {
        roomId,
        isTyping: true,
        displayName: 'Forged name',
        content: 'must never be delivered',
      });
      expect(await validTyping).toEqual({
        roomId,
        userId: senderId,
        displayName: 'Sender',
        isTyping: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(senderReceived).toBe(false);
      expect(received).toHaveLength(1);
    } finally {
      sender.disconnect();
      reader.disconnect();
      outsider.disconnect();
      recipient.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('idempotency cannot bypass removed membership or revoked write permission', async () => {
    await MessagingService.sendMessageRealtime(senderId, {
      roomId,
      clientMessageId,
      content: 'hello',
    });
    await prisma.chatRoomParticipant.update({
      where: { roomId_userId: { roomId, userId: senderId } },
      data: { canWrite: false },
    });
    await expect(
      MessagingService.sendMessageRealtime(senderId, {
        roomId,
        clientMessageId,
        content: 'retry',
      }),
    ).rejects.toThrow('Cannot send');
    await expect(
      MessagingService.sendMessageRealtime(outsiderId, {
        roomId,
        clientMessageId,
        content: 'retry',
      }),
    ).rejects.toThrow('Cannot send');
    expect(await prisma.chatMessage.count()).toBe(1);
  });
  test('history pages retain rich content, preserve legacy plain text, and do not overlap', async () => {
    await prisma.chatMessage.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        roomId,
        senderId,
        content: `Dispatch ${index}`,
      })),
    });
    await MessagingService.sendMessageRealtime(senderId, {
      roomId,
      clientMessageId,
      content: 'preview',
      richContent,
    });
    const latest = await MessagingService.getRoomMessages(senderId, roomId);
    expect(latest).toHaveLength(51);
    expect(latest.at(-1)?.richContent).toEqual(richContent);
    const earlier = await MessagingService.getRoomMessages(
      senderId,
      roomId,
      latest[0].id,
    );
    expect(earlier).toHaveLength(51);
    expect(
      new Set([...latest, ...earlier].map((message) => message.id)).size,
    ).toBe(102);
    expect(earlier[0]?.richContent).toBeNull();
    expect(earlier[0]?.id).toBeLessThan(latest[0].id);
    await expect(
      MessagingService.getRoomMessages(outsiderId, roomId),
    ).rejects.toThrow('Forbidden');
  });
  test('removed rich messages and quoted replies never expose their original body', async () => {
    const original = await MessagingService.sendMessageRealtime(senderId, {
      roomId,
      clientMessageId,
      content: 'preview',
      richContent,
    });
    await MessagingService.sendMessageRealtime(senderId, {
      roomId,
      content: 'Acknowledged',
      replyToMessageId: original.id,
    });
    await prisma.chatMessage.update({
      where: { id: original.id },
      data: { deletedAt: new Date() },
    });
    const history = await MessagingService.getRoomMessages(senderId, roomId);
    expect(history[0]?.content).toBe('');
    expect(history[0]?.richContent).toBeNull();
    expect(history[1]?.replyToMessage?.content).toBe('');
    const retry = await MessagingService.sendMessageRealtime(senderId, {
      roomId,
      clientMessageId,
      content: 'preview',
      richContent,
    });
    expect(serializeChatMessage(retry).content).toBe('');
    expect(serializeChatMessage(retry).richContent).toBeNull();
  });
});
