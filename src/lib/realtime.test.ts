import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import { silenceLogger } from 'test/utils/silenceLogger';

silenceLogger();

// Hermetic mock of the socket module: the facade must resolve it through a
// lazy dynamic import, and this test must never touch a real socket server.
// The holder is read at call time so each test can install a fresh fake.
const socketState: { server: Record<string, unknown> | null } = {
  server: null,
};
const evictUserFromChatRoom = vi.fn();
const evictUserFromAllianceChatRooms = vi.fn(async () => {});
let socketModuleFactoryCalls = 0;

mock.module('@/lib/socket', () => {
  socketModuleFactoryCalls += 1;
  return {
    getSocketIO: () => socketState.server,
    evictUserFromChatRoom,
    evictUserFromAllianceChatRooms,
    initializeSocket: vi.fn(),
    installSocketAccountGuard: vi.fn(),
  };
});

const {
  __resetRealtimeModuleCacheForTests,
  __setChatDoNamespaceForTests,
  emitToAll,
  emitToRoom,
  emitToUser,
  emitToUsers,
  evictUserFromAllianceChatRooms: facadeEvictUserFromAllianceChatRooms,
  evictUserFromChatRoom: facadeEvictUserFromChatRoom,
  isRealtimeEnabled,
  isUserPushEnabled,
} = await import('@/lib/realtime');
const { USER_MAILBOX_NOTIFY_URL } = await import('@/lib/realtimeTransport');

// Canary: bun module mocks are process-wide, so if another test file's mock of
// '@/lib/realtime' leaked into this run, bail instead of testing a stub.
if (typeof isRealtimeEnabled !== 'function' || !isRealtimeEnabled()) {
  throw new Error(
    '@/lib/realtime was replaced by a module mock; realtime facade test is invalid',
  );
}

type GlobalWithIo = typeof globalThis & { __OT_SOCKET_IO__?: unknown };

// Synthetic ids; no real players, rooms, or sockets.
const USER_ID = 7;
const OTHER_USER_ID = 8;
const ROOM_ID = 42;

const setFlag = (value: string | undefined) => {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_DISABLE_SOCKET;
  } else {
    process.env.NEXT_PUBLIC_DISABLE_SOCKET = value;
  }
};

const setTransport = (value: string | undefined) => {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_REALTIME_TRANSPORT;
  } else {
    process.env.NEXT_PUBLIC_REALTIME_TRANSPORT = value;
  }
};

/** Fake DO namespace whose mailbox stubs record (or fail) each /notify. */
const makeNamespace = (
  respond: (name: string) => Promise<Response> = async () =>
    new Response(JSON.stringify({ delivered: 1 })),
) => {
  const calls: Array<{ name: string; url: string; init?: RequestInit }> = [];
  const namespace = {
    idFromName: vi.fn((name: string) => ({ name })),
    get: vi.fn((id: { name: string }) => ({
      fetch: vi.fn(async (url: RequestInfo, init?: RequestInit) => {
        calls.push({ name: id.name, url: String(url), init });
        return respond(id.name);
      }),
    })),
  };
  __setChatDoNamespaceForTests(namespace);
  return { namespace, calls };
};

const makeServer = () => {
  const emit = vi.fn();
  const socketsLeave = vi.fn();
  const channel = { emit, socketsLeave };
  const server = {
    emit,
    // socket.io exposes `in` and `to` as aliases of the same channel builder.
    in: vi.fn(() => channel),
    to: vi.fn(() => channel),
  };
  return { server, emit, socketsLeave };
};

// The disabled path must never resolve the socket server, so the global is a
// getter that records access instead of a plain property.
let serverAccessed = false;
const installAccessTrackingGlobal = (server: unknown) => {
  Object.defineProperty(globalThis, '__OT_SOCKET_IO__', {
    configurable: true,
    get: () => {
      serverAccessed = true;
      return server;
    },
    set: () => {
      serverAccessed = true;
    },
  });
};

describe('realtime facade', () => {
  // Each test starts from a cold module cache so this file stays independent
  // of whichever suite imported the facade (or mocked '@/lib/socket') earlier
  // in the same process. Factory counts are snapshotted per test for the same
  // reason.
  let factoryCallsAtStart = 0;

  beforeEach(() => {
    __resetRealtimeModuleCacheForTests();
    factoryCallsAtStart = socketModuleFactoryCalls;
    serverAccessed = false;
    socketState.server = null;
    __setChatDoNamespaceForTests(null);
    setFlag(undefined);
    setTransport(undefined);
  });

  afterEach(() => {
    setFlag(undefined);
    setTransport(undefined);
    __setChatDoNamespaceForTests(undefined);
    socketState.server = null;
    delete (globalThis as GlobalWithIo).__OT_SOCKET_IO__;
  });

  it('is enabled while the kill-switch flag is unset or empty', () => {
    expect(isRealtimeEnabled()).toBe(true);
    setFlag('');
    expect(isRealtimeEnabled()).toBe(true);
  });

  it('is disabled when the flag is true or 1', () => {
    setFlag('true');
    expect(isRealtimeEnabled()).toBe(false);
    setFlag('1');
    expect(isRealtimeEnabled()).toBe(false);
  });

  // Runs before any enabled test so the facade has not loaded the socket
  // module yet: the disabled path must not import it at all.
  it('never imports the socket module and never throws when disabled', async () => {
    setFlag('true');
    const { emit } = makeServer();
    installAccessTrackingGlobal({ emit });

    await expect(
      emitToRoom(`room-${ROOM_ID}`, 'receiveMessage', { id: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      emitToUser(USER_ID, 'attackNotification', { hash: 'h' }),
    ).resolves.toBeUndefined();
    await expect(
      emitToUsers([USER_ID, OTHER_USER_ID], 'socialCountUpdate', { count: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      emitToAll('blogPostNotification', { postId: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      facadeEvictUserFromChatRoom(USER_ID, ROOM_ID),
    ).resolves.toBeUndefined();
    await expect(
      facadeEvictUserFromAllianceChatRooms(USER_ID, 99),
    ).resolves.toBeUndefined();

    expect(socketModuleFactoryCalls).toBe(factoryCallsAtStart);
    expect(serverAccessed).toBe(false);
    expect(evictUserFromChatRoom).not.toHaveBeenCalled();
    expect(evictUserFromAllianceChatRooms).not.toHaveBeenCalled();
  });

  it('emits to a room through the socket server when enabled', async () => {
    const { server, emit } = makeServer();
    socketState.server = server;

    await emitToRoom(`room-${ROOM_ID}`, 'receiveMessage', { id: 5 });

    // Delegation itself is proven by the socket-server assertions below; the
    // mock-factory call count is a bun registry detail that shifts with test
    // file order, so it is deliberately not asserted here.
    expect(server.to).toHaveBeenCalledWith(`room-${ROOM_ID}`);
    expect(emit).toHaveBeenCalledWith('receiveMessage', { id: 5 });
  });

  it('wraps user rooms as user-<id>', async () => {
    const { server, emit } = makeServer();
    socketState.server = server;

    await emitToUser(USER_ID, 'attackNotification', { hash: 'h' });

    expect(server.to).toHaveBeenCalledWith(`user-${USER_ID}`);
    expect(emit).toHaveBeenCalledWith('attackNotification', { hash: 'h' });
  });

  it('emits to every user in a list', async () => {
    const { server, emit } = makeServer();
    socketState.server = server;

    await emitToUsers([USER_ID, OTHER_USER_ID], 'socialCountUpdate', {
      count: 2,
    });

    expect(server.to).toHaveBeenCalledWith(`user-${USER_ID}`);
    expect(server.to).toHaveBeenCalledWith(`user-${OTHER_USER_ID}`);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('broadcasts to all sockets without a room', async () => {
    const { server, emit } = makeServer();
    socketState.server = server;

    await emitToAll('blogPostNotification', { postId: 3 });

    expect(emit).toHaveBeenCalledWith('blogPostNotification', { postId: 3 });
    expect(server.in).not.toHaveBeenCalled();
  });

  it('passes evictions through to the socket module', async () => {
    await facadeEvictUserFromChatRoom(USER_ID, ROOM_ID);
    expect(evictUserFromChatRoom).toHaveBeenCalledWith(USER_ID, ROOM_ID);

    await facadeEvictUserFromAllianceChatRooms(USER_ID, 99);
    expect(evictUserFromAllianceChatRooms).toHaveBeenCalledWith(USER_ID, 99);
  });

  it('is a silent no-op when getSocketIO returns null', async () => {
    const { server, emit } = makeServer();
    installAccessTrackingGlobal(server);

    await expect(
      emitToRoom(`room-${ROOM_ID}`, 'receiveMessage', { id: 5 }),
    ).resolves.toBeUndefined();
    await expect(
      emitToUser(USER_ID, 'attackNotification', { hash: 'h' }),
    ).resolves.toBeUndefined();
    await expect(
      facadeEvictUserFromChatRoom(USER_ID, ROOM_ID),
    ).resolves.toBeUndefined();
  });

  describe('Durable Object transport', () => {
    // Mirrors the preview build: socket kill switch on, DO pilot selected.
    beforeEach(() => {
      setFlag('true');
      setTransport('do');
    });

    it('reports per-user pushes as enabled only when someone can receive them', () => {
      expect(isUserPushEnabled()).toBe(true);
      setTransport(undefined);
      expect(isUserPushEnabled()).toBe(false);
      setFlag(undefined);
      expect(isUserPushEnabled()).toBe(true);
    });

    it('pushes newMessageNotification into each recipient mailbox', async () => {
      const { calls } = makeNamespace();
      const payload = { id: 9, chatRoomId: ROOM_ID };

      await emitToUsers(
        [USER_ID, OTHER_USER_ID],
        'newMessageNotification',
        payload,
      );

      expect(calls.map((call) => call.name).sort()).toEqual([
        `user:${USER_ID}`,
        `user:${OTHER_USER_ID}`,
      ]);
      for (const call of calls) {
        expect(call.url).toBe(USER_MAILBOX_NOTIFY_URL);
        expect(call.init?.method).toBe('POST');
        expect(JSON.parse(String(call.init?.body))).toEqual({
          event: 'newMessageNotification',
          payload,
        });
      }
      expect(socketModuleFactoryCalls).toBe(factoryCallsAtStart);
    });

    it.each([
      'attackNotification',
      'spyDefenseNotification',
      'goldTransferReceived',
      'friendRequestNotification',
      'goldRequestNotification',
      'socialCountUpdate',
    ])('pushes %s into the recipient mailbox', async (event) => {
      const { calls } = makeNamespace();
      const payload = { hash: 'h', battleId: 3 };

      await emitToUser(USER_ID, event, payload);

      expect(calls.map((call) => call.name)).toEqual([`user:${USER_ID}`]);
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
        event,
        payload,
      });
    });

    it('skips events the mailbox does not accept', async () => {
      const { namespace } = makeNamespace();

      await emitToUser(USER_ID, 'blogPostNotification', { hash: 'h' });

      expect(namespace.get).not.toHaveBeenCalled();
    });

    it('is a silent no-op without a CHAT_ROOM_DO binding', async () => {
      await expect(
        emitToUser(USER_ID, 'newMessageNotification', { id: 1 }),
      ).resolves.toBeUndefined();
    });

    it('keeps notifying other recipients when one mailbox fails', async () => {
      const { calls } = makeNamespace(async (name) => {
        if (name === `user:${USER_ID}`) throw new Error('mailbox down');
        return new Response(null, { status: 404 });
      });

      await expect(
        emitToUsers([USER_ID, OTHER_USER_ID], 'newMessageNotification', {
          id: 2,
        }),
      ).resolves.toBeUndefined();

      expect(calls).toHaveLength(2);
    });
  });
});
