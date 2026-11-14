import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import type { HibernatingSocketLike } from '@/durable-objects/chatDoCore';
import {
  ChatRoomDO,
  type ChatRoomDoEnv,
  type DoStateLike,
  type WebSocketPairLike,
} from '@/durable-objects/ChatRoomDO';
import { signRealtimeTicket } from '@/lib/realtimeTicket';

/**
 * End-to-end tests of the DO class itself with faked runtime pieces:
 * ctx.storage (Map), ctx.acceptWebSocket/getWebSockets (array), and an
 * injected WebSocketPair factory — no workerd required. The internal
 * endpoints are faked at the WORKER_SELF_REFERENCE binding boundary and the
 * mailbox namespace at the CHAT_ROOM_DO binding boundary, which is exactly
 * the surface the DO owns.
 */

const JWT_SECRET = 'do-test-jwt-secret';
const TASK_SECRET = 'do-test-task-secret';
const USER_ID = 7;
const OTHER_USER_ID = 8;
const ROOM_ID = 42;

class FakeSocket implements HibernatingSocketLike {
  readonly sent: string[] = [];

  closed: { code: number; reason: string } | null = null;

  readonly tags: string[] = [];

  private attachment: unknown = null;

  send(data: string): void {
    if (this.closed) throw new Error('send on closed socket');
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = { code, reason };
  }

  serializeAttachment(attachment: unknown): void {
    this.attachment = attachment;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  frames(): Array<{ event: string; payload: any }> {
    return this.sent.map(
      (raw) => JSON.parse(raw) as { event: string; payload: any },
    );
  }
}

const makeCtx = (): DoStateLike & {
  _store: Map<string, unknown>;
  _accepted: Array<{ ws: FakeSocket; tags: string[] }>;
} => {
  const store = new Map<string, unknown>();
  const accepted: Array<{ ws: FakeSocket; tags: string[] }> = [];
  const ctx = {
    _store: store,
    _accepted: accepted,
    storage: {
      get: async <T>(key: string): Promise<T | undefined> =>
        store.get(key) as T | undefined,
      put: async (key: string, value: unknown): Promise<void> => {
        store.set(key, value);
      },
    },
    acceptWebSocket: (ws: unknown, tags?: string[]) => {
      accepted.push({ ws: ws as FakeSocket, tags: tags ?? [] });
    },
    getWebSockets: (): FakeSocket[] => accepted.map((entry) => entry.ws),
  };
  return ctx as never;
};

const makeEnv = (options?: {
  sendResponse?: () => Response;
  readResponse?: () => Response;
}): ChatRoomDoEnv & {
  _mailboxFetch: ReturnType<typeof vi.fn>;
  _mailboxIds: string[];
} => {
  const mailboxFetch = vi.fn(async () => Response.json({ delivered: 1 }));
  const mailboxIds: string[] = [];
  const sendResponse =
    options?.sendResponse ??
    (() =>
      Response.json({
        message: {
          id: 1,
          roomId: ROOM_ID,
          content: 'hello',
          senderId: USER_ID,
        },
        tempId: 31,
        participantUserIds: [USER_ID, OTHER_USER_ID],
        notification: {
          id: 1,
          senderId: USER_ID,
          senderName: 'Sender',
          content: 'hello',
          timestamp: '2026-10-14T00:00:00.000Z',
          isRead: false,
          chatRoomId: ROOM_ID,
        },
      }));
  const readResponse =
    options?.readResponse ??
    (() =>
      Response.json({
        roomId: ROOM_ID,
        updates: [
          { messageId: 1, userId: USER_ID, readAt: '2026-10-14T00:00:00.000Z' },
        ],
        participantUserIds: [USER_ID, OTHER_USER_ID],
      }));

  return {
    JWT_SECRET,
    TASK_SECRET,
    WORKER_SELF_REFERENCE: {
      // workerd service bindings reject fetch calls that are not invoked as
      // methods ("Illegal invocation: function called with incorrect 'this'
      // reference"). Touching a this-property reproduces that in bun, so a
      // destructured `const { fetch } = binding` call fails here exactly as
      // it does in production. (Arrow mocks cannot catch this.)
      marker: 'self-reference-binding',
      fetch: vi.fn(async function (
        this: { marker: string },
        input: RequestInfo | URL,
        _init?: RequestInit,
      ) {
        if (!this.marker) {
          throw new TypeError(
            "Illegal invocation: function called with incorrect 'this' reference",
          );
        }
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/realtime/send')) {
          return sendResponse();
        }
        return readResponse();
      }),
    },
    CHAT_ROOM_DO: {
      idFromName: (name: string) => `id:${name}`,
      get: (id: unknown) => {
        mailboxIds.push(String(id));
        return { fetch: mailboxFetch };
      },
    },
    _mailboxFetch: mailboxFetch,
    _mailboxIds: mailboxIds,
  } as never;
};

const upgradeRequest = (path: string, ticket?: string): Request => {
  const url = new URL(`https://worker.test${path}`);
  if (ticket) url.searchParams.set('ticket', ticket);
  return new Request(url.toString(), { headers: { upgrade: 'websocket' } });
};

const roomTicket = async (userId = USER_ID, roomId: number | null = ROOM_ID) =>
  signRealtimeTicket(JWT_SECRET, { userId, roomId });

// The pair factory is injectable static state; restore it after every test so
// overrides cannot leak into other suites in the shared bun test process.
const originalCreateWebSocketPair = ChatRoomDO.createWebSocketPair;
afterEach(() => {
  ChatRoomDO.createWebSocketPair = originalCreateWebSocketPair;
});

describe('ChatRoomDO fetch (upgrade + authorization)', () => {
  it('rejects non-websocket requests with 426 and unknown paths with 404', async () => {
    const ctx = makeCtx();
    const env = makeEnv();
    const doInstance = new ChatRoomDO(ctx, env);

    const plain = await doInstance.fetch(
      new Request('https://worker.test/do/chat/42'),
    );
    expect(plain.status).toBe(426);

    const badPath = await doInstance.fetch(
      upgradeRequest('/do/chat/not-a-number'),
    );
    expect(badPath.status).toBe(404);

    const badPath2 = await doInstance.fetch(
      upgradeRequest('/do/chat/42/extra'),
    );
    expect(badPath2.status).toBe(404);
  });

  it('fails closed with 503 when JWT_SECRET is not configured', async () => {
    const ctx = makeCtx();
    const env = makeEnv();
    // An unset secret must refuse the upgrade, never verify against an
    // empty HMAC key (anyone could then mint tickets).
    Reflect.deleteProperty(env, 'JWT_SECRET');
    const doInstance = new ChatRoomDO(ctx, env);

    const response = await doInstance.fetch(
      upgradeRequest('/do/chat/42', 'v1.cGF5bG9hZA.c2ln'),
    );
    expect(response.status).toBe(503);
  });

  it('rejects missing, invalid, and wrong-room tickets', async () => {
    const ctx = makeCtx();
    const env = makeEnv();
    const doInstance = new ChatRoomDO(ctx, env);

    expect((await doInstance.fetch(upgradeRequest('/do/chat/42'))).status).toBe(
      401,
    );
    expect(
      (await doInstance.fetch(upgradeRequest('/do/chat/42', 'v1.garbage.sig')))
        .status,
    ).toBe(401);
    const wrongRoom = await roomTicket(USER_ID, 43);
    expect(
      (await doInstance.fetch(upgradeRequest('/do/chat/42', wrongRoom))).status,
    ).toBe(401);
  });

  it('accepts a valid ticket, tags and attaches metadata, persists identity', async () => {
    const ctx = makeCtx();
    const env = makeEnv();
    const server = new FakeSocket();
    ChatRoomDO.createWebSocketPair = () =>
      ({ server, client: {} }) as unknown as WebSocketPairLike;
    const doInstance = new ChatRoomDO(ctx, env);

    const response = await doInstance.fetch(
      upgradeRequest('/do/chat/42', await roomTicket()),
    );

    expect(response.status).toBe(101);
    expect(ctx._accepted).toHaveLength(1);
    expect(ctx._accepted[0]!.tags).toEqual([`uid:${USER_ID}`]);
    expect(server.frames()[0]).toEqual({
      event: 'hello',
      payload: { roomId: 42 },
    });
    expect(ctx._store.get('do-identity')).toEqual({ kind: 'room', roomId: 42 });
  });

  it('refuses a personal-channel ticket on a room DO and vice versa', async () => {
    const ctx = makeCtx();
    const env = makeEnv();
    ChatRoomDO.createWebSocketPair = () =>
      ({
        server: new FakeSocket(),
        client: {},
      }) as unknown as WebSocketPairLike;
    const doInstance = new ChatRoomDO(ctx, env);

    const userTicket = await roomTicket(USER_ID, null);
    expect(
      (await doInstance.fetch(upgradeRequest('/do/chat/42', userTicket)))
        .status,
    ).toBe(401);
  });

  it('serves a user mailbox connection and its internal /notify endpoint', async () => {
    const ctx = makeCtx();
    const env = makeEnv();
    const server = new FakeSocket();
    ChatRoomDO.createWebSocketPair = () =>
      ({ server, client: {} }) as unknown as WebSocketPairLike;
    const doInstance = new ChatRoomDO(ctx, env);

    const ticket = await signRealtimeTicket(JWT_SECRET, {
      userId: OTHER_USER_ID,
      roomId: null,
    });
    expect(
      (await doInstance.fetch(upgradeRequest('/do/user/8', ticket))).status,
    ).toBe(101);

    // /notify broadcasts allowlisted events to connected sockets.
    const ok = await doInstance.fetch(
      new Request('https://worker.test/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'newMessageNotification',
          payload: { id: 1, chatRoomId: ROOM_ID },
        }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(server.frames()).toContainEqual({
      event: 'newMessageNotification',
      payload: { id: 1, chatRoomId: ROOM_ID },
    });

    // Game alerts (attack, spy, gold, friend) reach the player too.
    const attack = await doInstance.fetch(
      new Request('https://worker.test/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'attackNotification',
          payload: { hash: 'a1', battleId: 42 },
        }),
      }),
    );
    expect(attack.status).toBe(200);
    expect(server.frames()).toContainEqual({
      event: 'attackNotification',
      payload: { hash: 'a1', battleId: 42 },
    });

    // Unsupported events are refused.
    const bad = await doInstance.fetch(
      new Request('https://worker.test/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'arbitraryEvent', payload: {} }),
      }),
    );
    expect(bad.status).toBe(400);
  });
});

describe('ChatRoomDO webSocketMessage (pilot scope)', () => {
  let server: FakeSocket;
  let other: FakeSocket;
  let ctx: ReturnType<typeof makeCtx>;
  let env: ReturnType<typeof makeEnv>;
  let doInstance: ChatRoomDO;

  beforeEach(async () => {
    server = new FakeSocket();
    other = new FakeSocket();
    ctx = makeCtx();
    env = makeEnv();
    doInstance = new ChatRoomDO(ctx, env);

    const connect = async (
      socket: FakeSocket,
      userId: number,
    ): Promise<void> => {
      ChatRoomDO.createWebSocketPair = () =>
        ({ server: socket, client: {} }) as unknown as WebSocketPairLike;
      const response = await doInstance.fetch(
        upgradeRequest('/do/chat/42', await roomTicket(userId)),
      );
      expect(response.status).toBe(101);
    };
    await connect(server, USER_ID);
    await connect(other, OTHER_USER_ID);
  });

  it('persists via the send endpoint, broadcasts, and notifies mailboxes', async () => {
    await doInstance.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'hello',
        tempId: 31,
      }),
    );

    const fetchCall = (
      env.WORKER_SELF_REFERENCE!.fetch as ReturnType<typeof vi.fn>
    ).mock.calls[0]!;
    expect(fetchCall[0]).toBe(
      'https://do.openthrone.internal/api/realtime/send',
    );
    const init = fetchCall[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      TASK_SECRET,
    );
    expect(JSON.parse(String(init.body))).toEqual({
      userId: USER_ID,
      roomId: ROOM_ID,
      content: 'hello',
      tempId: 31,
    });

    // Both subscribers receive the message with the tempId echo.
    for (const socket of [server, other]) {
      expect(socket.frames()).toContainEqual({
        event: 'receiveMessage',
        payload: {
          id: 1,
          roomId: ROOM_ID,
          content: 'hello',
          senderId: USER_ID,
          tempId: 31,
        },
      });
    }

    // Only the other participant's mailbox is notified.
    expect(env._mailboxFetch).toHaveBeenCalledTimes(1);
    expect(env._mailboxIds).toEqual(['id:user:8']);
    const mailboxInit = env._mailboxFetch.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(mailboxInit.body))).toEqual({
      event: 'newMessageNotification',
      payload: expect.objectContaining({
        chatRoomId: ROOM_ID,
        senderId: USER_ID,
      }),
    });
  });

  /** Frame events after the connect-time `hello`. */
  const eventsAfterHello = (socket: FakeSocket): string[] =>
    socket
      .frames()
      .map((frame) => frame.event)
      .filter((event) => event !== 'hello');

  it('acknowledges clientMessageId sends to the sender only, forwarding rich content', async () => {
    const clientMessageId = '00000000-0000-4000-8000-000000000001';
    const richContent = { version: 1, doc: { type: 'doc', content: [] } };
    await doInstance.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'hello',
        clientMessageId,
        richContent,
      }),
    );

    const init = (env.WORKER_SELF_REFERENCE!.fetch as ReturnType<typeof vi.fn>)
      .mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      clientMessageId,
      richContent,
    });
    expect(server.frames()).toContainEqual({
      event: 'sendMessageAck',
      payload: {
        clientMessageId,
        ack: {
          ok: true,
          message: expect.objectContaining({ id: 1, roomId: ROOM_ID }),
        },
      },
    });
    expect(eventsAfterHello(other)).toEqual(['receiveMessage']);
  });

  it('re-acknowledges a deduplicated retry without fan-out', async () => {
    const clientMessageId = '00000000-0000-4000-8000-000000000002';
    const dedupEnv = makeEnv({
      sendResponse: () =>
        Response.json({
          message: { id: 3, roomId: ROOM_ID, content: 'x' },
          deduplicated: true,
          participantUserIds: [USER_ID, OTHER_USER_ID],
          notification: null,
        }),
    });
    const dedupDo = new ChatRoomDO(ctx, dedupEnv);
    await dedupDo.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'x',
        clientMessageId,
      }),
    );
    expect(eventsAfterHello(server)).toEqual([
      'sendMessageAck',
      'receiveMessage',
    ]);
    expect(eventsAfterHello(other)).toEqual([]);
    expect(dedupEnv._mailboxFetch).not.toHaveBeenCalled();
  });

  it('fails the acknowledgement as RATE_LIMITED on a 429', async () => {
    const clientMessageId = '00000000-0000-4000-8000-000000000003';
    const limitedEnv = makeEnv({
      sendResponse: () => Response.json({ error: 'nope' }, { status: 429 }),
    });
    const limitedDo = new ChatRoomDO(ctx, limitedEnv);
    await limitedDo.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'x',
        clientMessageId,
      }),
    );
    expect(server.frames()).toContainEqual({
      event: 'sendMessageAck',
      payload: { clientMessageId, ack: { ok: false, error: 'RATE_LIMITED' } },
    });
  });

  it('evicts sockets of users missing from the participant list', async () => {
    const staleEnv = makeEnv({
      sendResponse: () =>
        Response.json({
          message: { id: 2, roomId: ROOM_ID, content: 'x' },
          participantUserIds: [USER_ID],
          notification: null,
        }),
    });
    const staleDo = new ChatRoomDO(ctx, staleEnv);
    // other (user 8) is connected via ctx but not a participant anymore.
    await staleDo.webSocketMessage(
      server,
      JSON.stringify({ type: 'sendMessage', roomId: ROOM_ID, content: 'x' }),
    );

    expect(other.closed).toEqual({
      code: 1008,
      reason: 'no longer a participant',
    });
    expect(server.closed).toBeNull();
  });

  it('surfaces endpoint failures as messageError (429 → rate text)', async () => {
    const limitedEnv = makeEnv({
      sendResponse: () => Response.json({ error: 'nope' }, { status: 429 }),
    });
    const limitedDo = new ChatRoomDO(ctx, limitedEnv);
    await limitedDo.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'x',
        tempId: 5,
      }),
    );
    expect(server.frames()).toContainEqual({
      event: 'messageError',
      payload: { tempId: 5, error: 'You are sending messages too quickly.' },
    });
  });

  it('enforces the per-connection send rate limit (10 / 10 s)', async () => {
    for (let index = 0; index < 10; index += 1) {
      await doInstance.webSocketMessage(
        server,
        JSON.stringify({
          type: 'sendMessage',
          roomId: ROOM_ID,
          content: `m${index}`,
        }),
      );
    }
    await doInstance.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'one too many',
        tempId: 77,
      }),
    );
    expect(server.frames()).toContainEqual({
      event: 'messageError',
      payload: { tempId: 77, error: 'You are sending messages too quickly.' },
    });
  });

  it('rejects frames addressed to a different room', async () => {
    await doInstance.webSocketMessage(
      server,
      JSON.stringify({
        type: 'sendMessage',
        roomId: 999,
        content: 'x',
        tempId: 6,
      }),
    );
    expect(server.frames()).toContainEqual({
      event: 'messageError',
      payload: { tempId: 6, error: 'Invalid message data' },
    });
    expect(env.WORKER_SELF_REFERENCE!.fetch).not.toHaveBeenCalled();
  });

  it('answers malformed frames with messageError, oversized frames with close', async () => {
    await doInstance.webSocketMessage(server, 'not json at all');
    expect(server.frames()).toContainEqual({
      event: 'messageError',
      payload: { tempId: undefined, error: 'Invalid message data' },
    });

    const oversized = JSON.stringify({
      type: 'sendMessage',
      roomId: ROOM_ID,
      content: 'a'.repeat(40_000),
    });
    await doInstance.webSocketMessage(server, oversized);
    expect(server.closed).toEqual({ code: 1009, reason: 'frame too large' });
  });

  it('handles markAsRead by broadcasting messagesRead', async () => {
    await doInstance.webSocketMessage(
      server,
      JSON.stringify({
        type: 'markAsRead',
        roomId: ROOM_ID,
        messageIds: [1, 2],
      }),
    );

    const fetchCall = (
      env.WORKER_SELF_REFERENCE!.fetch as ReturnType<typeof vi.fn>
    ).mock.calls[0]!;
    expect(fetchCall[0]).toBe(
      'https://do.openthrone.internal/api/realtime/read',
    );
    expect(JSON.parse(String((fetchCall[1] as RequestInit).body))).toEqual({
      userId: USER_ID,
      roomId: ROOM_ID,
      messageIds: [1, 2],
    });

    for (const socket of [server, other]) {
      expect(socket.frames()).toContainEqual({
        event: 'messagesRead',
        payload: {
          roomId: ROOM_ID,
          updates: [
            {
              messageId: 1,
              userId: USER_ID,
              readAt: '2026-10-14T00:00:00.000Z',
            },
          ],
        },
      });
    }
  });

  it('cleans up membership on close', async () => {
    await doInstance.webSocketClose(server, 1000, '', true);
    await doInstance.webSocketMessage(
      other,
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'after close',
      }),
    );
    // Only the remaining socket gets the broadcast. (The fake endpoint's
    // canned message content is 'hello' regardless of the sent content, so
    // assert on the event rather than the payload.)
    expect(
      server.sent.filter((f) => f.includes('receiveMessage')),
    ).toHaveLength(0);
    expect(other.frames().map((frame) => frame.event)).toContain(
      'receiveMessage',
    );
  });
});

describe('ChatRoomDO.createWebSocketPair (default factory)', () => {
  // workerd's WebSocketPair is `{ 0: <client>, 1: <server> }`; the named
  // client/server keys of older examples are gone (WebSockets runtime API
  // docs). The default factory must normalize both shapes — deployed workerd
  // feeds it numeric keys, injected test fakes feed it named keys.
  const globalWithPair = globalThis as unknown as {
    WebSocketPair?: new () => unknown;
  };
  const originalPair = globalWithPair.WebSocketPair;

  const restore = () => {
    if (originalPair === undefined) {
      delete globalWithPair.WebSocketPair;
    } else {
      globalWithPair.WebSocketPair = originalPair;
    }
  };

  it('normalizes the workerd numeric-key shape {0: client, 1: server}', () => {
    const fakeClient = { kind: 'client' };
    const fakeServer = { kind: 'server' };
    globalWithPair.WebSocketPair = function () {
      return { 0: fakeClient, 1: fakeServer } as never;
    };
    try {
      const pair = ChatRoomDO.createWebSocketPair();
      expect(pair.server).toBe(fakeServer);
      expect(pair.client).toBe(fakeClient);
    } finally {
      restore();
    }
  });

  it('still accepts the legacy named-key shape used by injected fakes', () => {
    const fakeClient = { kind: 'client' };
    const fakeServer = { kind: 'server' };
    globalWithPair.WebSocketPair = function () {
      return { client: fakeClient, server: fakeServer } as never;
    };
    try {
      const pair = ChatRoomDO.createWebSocketPair();
      expect(pair.server).toBe(fakeServer);
      expect(pair.client).toBe(fakeClient);
    } finally {
      restore();
    }
  });

  it('fails loudly when the pair exposes neither shape', () => {
    globalWithPair.WebSocketPair = function () {
      return {} as never;
    };
    try {
      expect(() => ChatRoomDO.createWebSocketPair()).toThrow(
        'WebSocketPair returned neither named nor numeric socket keys',
      );
    } finally {
      restore();
    }
  });
});
