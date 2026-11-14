import { describe, expect, it } from 'bun:test';

import {
  broadcastFrame,
  deserializeConnectionMeta,
  FixedWindowCounter,
  type HibernatingSocketLike,
  MAX_INBOUND_FRAME_BYTES,
  MAX_MARK_AS_READ_IDS,
  parseInboundFrame,
  planEvictions,
  RoomMembership,
  serializeConnectionMeta,
} from '@/durable-objects/chatDoCore';

/** Minimal fake of a hibernating websocket (attachment API included). */
class FakeSocket implements HibernatingSocketLike {
  readonly sent: string[] = [];

  closed: { code: number; reason: string } | null = null;

  private attachment: unknown = null;

  readonly tags: string[] = [];

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
}

describe('parseInboundFrame (message validation)', () => {
  it('accepts a minimal sendMessage frame', () => {
    expect(
      parseInboundFrame(
        JSON.stringify({ type: 'sendMessage', roomId: 42, content: 'hi' }),
      ),
    ).toEqual({
      ok: true,
      frame: { type: 'sendMessage', roomId: 42, content: 'hi' },
    });
  });

  it('accepts a full sendMessage frame and drops unknown fields', () => {
    const result = parseInboundFrame(
      JSON.stringify({
        type: 'sendMessage',
        roomId: 42,
        content: 'hello',
        tempId: 99,
        replyToMessageId: 7,
        messageType: 'ATTACK_LOG_SHARE',
        sharedAttackLogId: 5,
        evilExtra: 'dropped',
      }),
    );
    expect(result).toEqual({
      ok: true,
      frame: {
        type: 'sendMessage',
        roomId: 42,
        content: 'hello',
        tempId: 99,
        replyToMessageId: 7,
        messageType: 'ATTACK_LOG_SHARE',
        sharedAttackLogId: 5,
      },
    });
  });

  it('rejects empty/whitespace content, bad roomId, and bad messageType', () => {
    for (const bad of [
      { type: 'sendMessage', roomId: 42, content: '   ' },
      { type: 'sendMessage', roomId: 0, content: 'hi' },
      { type: 'sendMessage', roomId: 42.5, content: 'hi' },
      { type: 'sendMessage', roomId: 42, content: 'hi', messageType: 'HTML' },
      { type: 'sendMessage', roomId: 42, content: 'hi', replyToMessageId: -1 },
    ]) {
      expect(parseInboundFrame(JSON.stringify(bad)).ok).toBe(false);
    }
  });

  it('echoes tempId on field failures so the client can clear its optimistic row', () => {
    const result = parseInboundFrame(
      JSON.stringify({
        type: 'sendMessage',
        roomId: 42,
        content: '',
        tempId: 31,
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-fields', tempId: 31 });
  });

  it('rejects oversized frames by byte length, not character count', () => {
    // 20 000 '€' characters are 60 000 UTF-8 bytes > 32 768 while being a
    // "short" string by .length.
    const multibyte = '€'.repeat(20_000);
    expect(multibyte.length).toBeLessThan(MAX_INBOUND_FRAME_BYTES);
    const result = parseInboundFrame(
      JSON.stringify({ type: 'sendMessage', roomId: 42, content: multibyte }),
    );
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects non-JSON and non-object frames', () => {
    expect(parseInboundFrame('not json').ok).toBe(false);
    expect(parseInboundFrame('42').ok).toBe(false);
    expect(parseInboundFrame('null').ok).toBe(false);
    expect(parseInboundFrame(42).ok).toBe(false);
  });

  it('rejects unknown frame types', () => {
    expect(
      parseInboundFrame(JSON.stringify({ type: 'addReaction', messageId: 1 })),
    ).toEqual({ ok: false, reason: 'unknown-type' });
  });

  it('normalizes markAsRead shapes and enforces the 100-id cap', () => {
    expect(
      parseInboundFrame(
        JSON.stringify({ type: 'markAsRead', roomId: 42, messageId: 5 }),
      ),
    ).toEqual({
      ok: true,
      frame: { type: 'markAsRead', roomId: 42, messageIds: [5] },
    });

    const ids = Array.from({ length: MAX_MARK_AS_READ_IDS }, (_, i) => i + 1);
    expect(
      parseInboundFrame(
        JSON.stringify({ type: 'markAsRead', roomId: 42, messageIds: ids }),
      ).ok,
    ).toBe(true);
    expect(
      parseInboundFrame(
        JSON.stringify({
          type: 'markAsRead',
          roomId: 42,
          messageIds: [...ids, 101],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseInboundFrame(
        JSON.stringify({ type: 'markAsRead', roomId: 42, messageIds: [] }),
      ).ok,
    ).toBe(false);
    expect(
      parseInboundFrame(
        JSON.stringify({
          type: 'markAsRead',
          roomId: 42,
          messageIds: [1, 'two'],
        }),
      ).ok,
    ).toBe(false);
  });
});

describe('FixedWindowCounter (per-connection rate limit)', () => {
  it('allows up to max per window then resets', () => {
    let now = 10_000;
    const counter = new FixedWindowCounter(3, 1_000, () => now);

    expect(counter.tryAcquire('a')).toBe(true);
    expect(counter.tryAcquire('a')).toBe(true);
    expect(counter.tryAcquire('a')).toBe(true);
    expect(counter.tryAcquire('a')).toBe(false);

    now += 1_000;
    expect(counter.tryAcquire('a')).toBe(true);
  });

  it('tracks keys independently and prunes expired windows', () => {
    let now = 0;
    const counter = new FixedWindowCounter(1, 100, () => now);

    expect(counter.tryAcquire('a')).toBe(true);
    expect(counter.tryAcquire('b')).toBe(true);
    expect(counter.tryAcquire('a')).toBe(false);

    now += 100;
    expect(counter.tryAcquire('a')).toBe(true);
    // 'b' expired and was pruned; only 'a' (fresh window) remains.
    expect(counter.size).toBe(1);
  });
});

describe('hibernation metadata (de)serialization', () => {
  it('round-trips connection metadata', () => {
    const meta = { userId: 7, connectedAt: 123456 };
    expect(deserializeConnectionMeta(serializeConnectionMeta(meta))).toEqual(
      meta,
    );
  });

  it('rejects wrong versions and malformed shapes', () => {
    expect(deserializeConnectionMeta(null)).toBeNull();
    expect(deserializeConnectionMeta('nope')).toBeNull();
    expect(deserializeConnectionMeta({ userId: 7, connectedAt: 1 })).toBeNull(); // no v
    expect(
      deserializeConnectionMeta({ v: 999, userId: 7, connectedAt: 1 }),
    ).toBeNull();
    expect(
      deserializeConnectionMeta({ v: 1, userId: -1, connectedAt: 1 }),
    ).toBeNull();
    expect(
      deserializeConnectionMeta({ v: 1, userId: 7, connectedAt: 'x' }),
    ).toBeNull();
  });
});

describe('RoomMembership (room membership bookkeeping)', () => {
  const socketOf = (userId: number): FakeSocket => {
    const socket = new FakeSocket();
    socket.serializeAttachment(
      serializeConnectionMeta({ userId, connectedAt: 1 }),
    );
    return socket;
  };

  it('rebuilds from hibernated sockets via attachments', () => {
    const a = socketOf(7);
    const b = socketOf(8);
    const c = socketOf(7);
    const membership = RoomMembership.fromSockets([a, b, c]);

    expect(membership.userIds()).toEqual(new Set([7, 8]));
    expect(membership.connectionCount).toBe(3);
    expect(membership.userCount).toBe(2);
    expect(membership.socketsOf(7)).toEqual([a, c]);
  });

  it('ignores sockets with unreadable attachments', () => {
    const broken = new FakeSocket();
    const membership = RoomMembership.fromSockets([broken]);
    expect(membership.connectionCount).toBe(0);
  });

  it('removes sockets and drops empty users', () => {
    const a = socketOf(7);
    const b = socketOf(7);
    const membership = RoomMembership.fromSockets([a, b]);
    membership.remove(a);
    expect(membership.socketsOf(7)).toEqual([b]);
    membership.remove(b);
    expect(membership.userIds()).toEqual(new Set());
  });
});

describe('fanout helpers', () => {
  it('broadcastFrame delivers to every socket and swallows dead ones', () => {
    const alive = new FakeSocket();
    const dead = new FakeSocket();
    dead.close(1006);
    const delivered = broadcastFrame([alive, dead], 'receiveMessage', {
      id: 1,
    });

    expect(delivered).toBe(1);
    expect(alive.sent).toEqual([
      JSON.stringify({ event: 'receiveMessage', payload: { id: 1 } }),
    ]);
  });

  it('planEvictions lists connected non-participants only', () => {
    const member = socketOf(7);
    const stale = socketOf(9);
    const membership = RoomMembership.fromSockets([member, stale]);

    expect(planEvictions(membership, [7, 8])).toEqual([9]);
    expect(planEvictions(membership, [7, 9])).toEqual([]);
  });
});

function socketOf(userId: number): FakeSocket {
  const socket = new FakeSocket();
  socket.serializeAttachment(
    serializeConnectionMeta({ userId, connectedAt: 1 }),
  );
  return socket;
}
