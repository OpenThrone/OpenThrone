import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { silenceLogger } from 'test/utils/silenceLogger';

import {
  type ChatDoTransport,
  createChatDoTransport,
  type WebSocketLike,
} from '@/lib/realtimeDoClient';

silenceLogger();

/** Fake native websocket: manual lifecycle, records sent frames. */
class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  readonly url: string;

  readonly sent: string[] = [];

  closed = false;

  closeCode: number | null = null;

  onopen: (() => void) | null = null;

  onclose: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.closed) throw new Error('send on closed socket');
    this.sent.push(data);
  }

  close(code = 1000): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCode = code;
    this.onclose?.();
  }

  // Test-side simulation of server behavior.
  serverOpen(): void {
    this.onopen?.();
  }

  serverMessage(event: string, payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ event, payload }) });
  }
}

// Synthetic ids only.
const USER_ID = 7;
const ROOM_ID = 42;
const CLIENT_MESSAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_MESSAGE_ID = '00000000-0000-4000-8000-000000000002';

interface Harness {
  transport: ChatDoTransport;
  dispatch: ReturnType<typeof vi.fn>;
  connectionChange: ReturnType<typeof vi.fn>;
  connectionFailed: ReturnType<typeof vi.fn>;
  fetchTicket: ReturnType<typeof vi.fn>;
  timers: Array<() => void>;
  clearedTimers: number[];
}

const makeHarness = (): Harness => {
  FakeWebSocket.instances = [];
  const timers: Array<() => void> = [];
  const clearedTimers: number[] = [];
  const dispatch = vi.fn();
  const connectionChange = vi.fn();
  const connectionFailed = vi.fn();
  const fetchTicket = vi.fn(async (roomScope: number | null) =>
    roomScope === null ? 'user-ticket' : `room-ticket-${roomScope}`,
  );

  const transport = createChatDoTransport(
    {
      dispatch,
      onConnectionChange: connectionChange,
      onConnectionFailed: connectionFailed,
    },
    {
      fetchTicket,
      openWebSocket: (url) => new FakeWebSocket(url),
      origin: () => 'https://app.example',
      setTimer: (fn) => {
        timers.push(fn);
        return timers.length - 1;
      },
      clearTimer: (id) => {
        clearedTimers.push(id as number);
      },
    },
  );

  return {
    transport,
    dispatch,
    connectionChange,
    connectionFailed,
    fetchTicket,
    timers,
    clearedTimers,
  };
};

const userSocket = (): FakeWebSocket => FakeWebSocket.instances[0]!;
const roomSocket = (): FakeWebSocket => FakeWebSocket.instances[1]!;

/** Socket creation awaits a ticket fetch; tick past those microtasks. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('ChatDoTransport (browser DO transport)', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it('opens the user mailbox socket on registerUser and reports connected', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    await settle();

    expect(harness.fetchTicket).toHaveBeenCalledWith(null);
    expect(userSocket().url).toBe(
      'wss://app.example/do/user/7?ticket=user-ticket',
    );

    userSocket().serverOpen();
    expect(harness.connectionChange).toHaveBeenCalledWith(true);
    expect(harness.connectionFailed).toHaveBeenCalledWith(false);
  });

  it('opens the room socket on joinRoom and wires sends through it', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();

    expect(harness.fetchTicket).toHaveBeenCalledWith(ROOM_ID);
    expect(roomSocket().url).toBe(
      'wss://app.example/do/chat/42?ticket=room-ticket-42',
    );

    harness.transport.emit('sendMessage', {
      roomId: ROOM_ID,
      content: 'hi',
      tempId: 5,
    });
    harness.transport.emit('markAsRead', { roomId: ROOM_ID, messageId: 9 });

    expect(roomSocket().sent).toEqual([
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'hi',
        tempId: 5,
      }),
      JSON.stringify({ type: 'markAsRead', roomId: ROOM_ID, messageIds: [9] }),
    ]);
    expect(userSocket().sent).toHaveLength(0);
  });

  it('dispatches received frames into the shared event registry', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();

    roomSocket().serverMessage('receiveMessage', { id: 1, roomId: ROOM_ID });
    userSocket().serverMessage('newMessageNotification', {
      id: 1,
      chatRoomId: 99,
    });

    expect(harness.dispatch).toHaveBeenCalledWith('receiveMessage', {
      id: 1,
      roomId: ROOM_ID,
    });
    expect(harness.dispatch).toHaveBeenCalledWith('newMessageNotification', {
      id: 1,
      chatRoomId: 99,
    });
  });

  it('acknowledges sends through sendMessageAck without dispatching it', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();

    const ack = vi.fn();
    harness.transport.emitWithAck(
      'sendMessage',
      { roomId: ROOM_ID, content: 'hi', clientMessageId: CLIENT_MESSAGE_ID },
      10_000,
      ack,
    );
    expect(roomSocket().sent).toEqual([
      JSON.stringify({
        type: 'sendMessage',
        roomId: ROOM_ID,
        content: 'hi',
        clientMessageId: CLIENT_MESSAGE_ID,
      }),
    ]);
    expect(ack).not.toHaveBeenCalled();

    const result = { ok: true, message: { id: 1, roomId: ROOM_ID } };
    roomSocket().serverMessage('sendMessageAck', {
      clientMessageId: CLIENT_MESSAGE_ID,
      ack: result,
    });
    expect(ack).toHaveBeenCalledWith(null, result);
    expect(harness.clearedTimers).toHaveLength(1);
    expect(harness.dispatch).not.toHaveBeenCalledWith(
      'sendMessageAck',
      expect.anything(),
    );

    // A late duplicate ack settles nothing twice.
    roomSocket().serverMessage('sendMessageAck', {
      clientMessageId: CLIENT_MESSAGE_ID,
      ack: result,
    });
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('fails acknowledged sends on timeout, without a room, and on stop()', async () => {
    const noRoom = vi.fn();
    harness.transport.emitWithAck(
      'sendMessage',
      { roomId: ROOM_ID, content: 'hi', clientMessageId: CLIENT_MESSAGE_ID },
      10_000,
      noRoom,
    );
    expect(noRoom).toHaveBeenCalledWith(expect.any(Error), undefined);

    const unsupported = vi.fn();
    harness.transport.emitWithAck('addReaction', {}, 10_000, unsupported);
    expect(unsupported).toHaveBeenCalledWith(expect.any(Error), undefined);

    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();

    const timedOut = vi.fn();
    harness.transport.emitWithAck(
      'sendMessage',
      { roomId: ROOM_ID, content: 'hi', clientMessageId: CLIENT_MESSAGE_ID },
      10_000,
      timedOut,
    );
    harness.timers.at(-1)?.();
    expect(timedOut).toHaveBeenCalledWith(expect.any(Error), undefined);

    const stopped = vi.fn();
    harness.transport.emitWithAck(
      'sendMessage',
      { roomId: ROOM_ID, content: 'again', clientMessageId: OTHER_MESSAGE_ID },
      10_000,
      stopped,
    );
    harness.transport.stop();
    expect(stopped).toHaveBeenCalledWith(expect.any(Error), undefined);
  });

  it('closes the room socket on leaveRoom without reconnect attempts', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();
    harness.transport.emit('leaveRoom', ROOM_ID);

    expect(roomSocket().closed).toBe(true);
    // Flushing scheduled timers must not re-open any room socket.
    harness.timers.splice(0).forEach((fn) => fn());
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('closes the previous room socket when switching rooms', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();
    harness.transport.emit('joinRoom', 43);
    await settle();

    expect(roomSocket().closed).toBe(true);
    const next = FakeWebSocket.instances[2]!;
    expect(next.url).toContain('/do/chat/43');
  });

  it('schedules independent reconnects when both channels drop', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();
    userSocket().serverOpen();
    roomSocket().serverOpen();

    // A network blip drops both channels at once: each must keep its own
    // pending reconnect. A shared timer slot previously cancelled whichever
    // channel dropped first.
    roomSocket().close(1006);
    userSocket().close(1006);

    expect(harness.timers).toHaveLength(2);
    expect(harness.clearedTimers).toEqual([]);

    harness.timers.splice(0).forEach((fn) => fn());
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(4);
    expect(harness.fetchTicket).toHaveBeenCalledWith(null);
    expect(harness.fetchTicket).toHaveBeenCalledWith(ROOM_ID);
  });

  it('reconnects the user socket with backoff and gives up after 5 attempts', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    await settle();
    userSocket().serverOpen();
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Server drops us: five reconnect attempts, then connectionFailed.
    userSocket().close(1006);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      harness.timers.splice(0).forEach((fn) => fn());
      // Macrotask tick settles the async ticket fetch inside openUserSocket.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const latest =
        FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
      expect(FakeWebSocket.instances).toHaveLength(2 + attempt);
      latest.close(1006);
    }
    harness.timers.splice(0).forEach((fn) => fn());

    expect(harness.connectionFailed).toHaveBeenCalledWith(true);
    // 1 initial + 5 reconnects.
    expect(harness.fetchTicket).toHaveBeenCalledTimes(6);
  });

  it('falls back to silence on stop(): sockets closed, no further dispatch', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    await settle();
    userSocket().serverOpen();
    harness.transport.emit('joinRoom', ROOM_ID);
    await settle();

    harness.transport.stop();

    expect(userSocket().closed).toBe(true);
    expect(roomSocket().closed).toBe(true);
    expect(harness.connectionChange).toHaveBeenLastCalledWith(false);
  });

  it('ignores out-of-scope events (reactions stay on their existing surfaces)', async () => {
    harness.transport.emit('registerUser', { userId: USER_ID });
    await settle();
    harness.transport.emit('addReaction', { messageId: 1 });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(userSocket().sent).toHaveLength(0);
  });
});
