import { describe, expect, it } from 'bun:test';

import {
  REALTIME_TICKET_TTL_MS,
  signRealtimeTicket,
  verifyRealtimeTicket,
} from '@/lib/realtimeTicket';

// Synthetic values only.
const SECRET = 'test-realtime-ticket-secret';
const OTHER_SECRET = 'a-completely-different-secret';
const USER_ID = 7;
const ROOM_ID = 42;

describe('realtime ticket sign/verify', () => {
  it('round-trips a room ticket', async () => {
    const ticket = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });

    const result = await verifyRealtimeTicket(SECRET, ticket, {
      expectedRoomId: ROOM_ID,
    });
    expect(result).toEqual({ ok: true, userId: USER_ID, roomId: ROOM_ID });
  });

  it('round-trips a personal-channel ticket and enforces the user binding', async () => {
    const ticket = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: null,
    });

    const result = await verifyRealtimeTicket(SECRET, ticket, {
      expectedRoomId: null,
      expectedUserId: USER_ID,
    });
    expect(result).toEqual({ ok: true, userId: USER_ID, roomId: null });

    // A room ticket may not open a personal channel.
    const roomTicket = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });
    expect(
      await verifyRealtimeTicket(SECRET, roomTicket, {
        expectedRoomId: null,
        expectedUserId: USER_ID,
      }),
    ).toEqual({ ok: false, reason: 'wrong-room' });

    // Someone else's personal channel is refused.
    expect(
      await verifyRealtimeTicket(SECRET, ticket, {
        expectedRoomId: null,
        expectedUserId: 999,
      }),
    ).toEqual({ ok: false, reason: 'wrong-user' });
  });

  it('refuses a room ticket presented to a different room', async () => {
    const ticket = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });

    expect(
      await verifyRealtimeTicket(SECRET, ticket, {
        expectedRoomId: ROOM_ID + 1,
      }),
    ).toEqual({ ok: false, reason: 'wrong-room' });
  });

  it('refuses tickets signed with a different secret', async () => {
    const ticket = await signRealtimeTicket(OTHER_SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });

    expect(
      await verifyRealtimeTicket(SECRET, ticket, { expectedRoomId: ROOM_ID }),
    ).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuses tampered payloads', async () => {
    const ticket = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });
    const [, payload, signature] = ticket.split('.') as [
      string,
      string,
      string,
    ];

    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { userId: number; roomId: number };
    decoded.userId = 999;
    const tamperedPayload = btoa(JSON.stringify(decoded))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(
      await verifyRealtimeTicket(SECRET, `v1.${tamperedPayload}.${signature}`, {
        expectedRoomId: ROOM_ID,
      }),
    ).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuses a non-base64 signature part as malformed', async () => {
    const ticket = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });
    const [, payload] = ticket.split('.') as [string, string, string];

    expect(
      await verifyRealtimeTicket(SECRET, `v1.${payload}.%%%`, {
        expectedRoomId: ROOM_ID,
      }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses expired tickets and honors the injected clock', async () => {
    let now = 1_000_000;
    const ticket = await signRealtimeTicket(
      SECRET,
      { userId: USER_ID, roomId: ROOM_ID },
      () => now,
    );
    expect(
      await verifyRealtimeTicket(
        SECRET,
        ticket,
        { expectedRoomId: ROOM_ID },
        () => now + 1,
      ),
    ).toEqual({ ok: true, userId: USER_ID, roomId: ROOM_ID });

    now += REALTIME_TICKET_TTL_MS;
    expect(
      await verifyRealtimeTicket(
        SECRET,
        ticket,
        { expectedRoomId: ROOM_ID },
        () => now,
      ),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses malformed tickets', async () => {
    for (const bad of ['', 'garbage', 'v1.only-one-dot']) {
      expect(
        await verifyRealtimeTicket(SECRET, bad, { expectedRoomId: ROOM_ID }),
      ).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(
      await verifyRealtimeTicket(SECRET, 'v1.###.???', {
        expectedRoomId: ROOM_ID,
      }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('mints distinct tickets for identical claims (jti)', async () => {
    const a = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });
    const b = await signRealtimeTicket(SECRET, {
      userId: USER_ID,
      roomId: ROOM_ID,
    });
    expect(a).not.toBe(b);
  });
});
