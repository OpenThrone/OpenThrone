import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

/**
 * Auth-requirement tests for POST /api/realtime/ticket (#23 pilot).
 *
 * The real gate is `withAuth` (`src/middleware/auth.ts`), whose full chain
 * (getServerSession over next-auth, runtime-feature and maintenance blocks)
 * needs a live Next runtime. The mock below is faithful to the part under
 * test — no session ⇒ 401 before the handler runs — mirroring the real
 * middleware's session check (`src/middleware/auth.ts:64-69`). Everything
 * else is real: the route, `withLockedChatRoom`/`assertCanJoinChatRoom`
 * (against the shared prisma mock, the same hermetic pattern as
 * `src/lib/socket.joinRoom.test.ts`), and the pure ticket signer/verifier.
 */
mock.module('@/middleware/auth', () => ({
  withAuth:
    (handler: (req: any, res: any) => unknown) =>
    async (req: any, res: any) => {
      if (!req.session?.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      req.session.user.id = Number(req.session.user.id);
      return handler(req, res);
    },
}));

installMockPrisma(vi);
silenceLogger();

const ticketRoute = (await import('@/pages/api/realtime/ticket')).default;

const JWT_SECRET_FOR_TEST = 'synthetic-ticket-test-secret';

const makeRes = () => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const makeReq = (options?: {
  method?: string;
  session?: { user: { id: number | string } };
  body?: unknown;
}): Record<string, unknown> => ({
  method: options?.method ?? 'POST',
  headers: {},
  session: options?.session,
  body: options?.body ?? {},
});

// Synthetic ids; no real players or rooms.
const USER_ID = 7;
const ROOM_ID = 42;

describe('POST /api/realtime/ticket (auth requirement)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET_FOR_TEST;
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);
    mockPrisma.$transaction = vi
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => unknown) =>
        callback(mockPrisma),
      );
    mockPrisma.chatRoom = {
      findUnique: (() =>
        Promise.resolve({ id: ROOM_ID, allianceId: null })) as never,
    };
    mockPrisma.chatRoomParticipant = {
      findUnique: (async () => ({ id: 1 })) as never,
    };
    mockPrisma.alliance_memberships = {
      findUnique: (async () => ({ id: 1 })) as never,
    };
  });

  it('refuses unauthenticated callers (401) before any handler logic', async () => {
    const res = makeRes();
    await ticketRoute(makeReq({ session: undefined }) as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('answers 405 for non-POST methods', async () => {
    const res = makeRes();
    await ticketRoute(
      makeReq({ method: 'GET', session: { user: { id: USER_ID } } }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(405);
  });

  it('issues a verifiable personal-channel ticket for an authenticated session', async () => {
    const res = makeRes();
    await ticketRoute(
      makeReq({ session: { user: { id: USER_ID } }, body: {} }) as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { ticket: string; roomScope: number | null };
    expect(body.roomScope).toBeNull();

    const { verifyRealtimeTicket } = await import('@/lib/realtimeTicket');
    const verified = await verifyRealtimeTicket(
      JWT_SECRET_FOR_TEST,
      body.ticket,
      {
        expectedRoomId: null,
        expectedUserId: USER_ID,
      },
    );
    expect(verified).toEqual({ ok: true, userId: USER_ID, roomId: null });
  });

  it('runs the join authorization (participant row) before issuing a room ticket', async () => {
    const seen: Array<Record<string, unknown>> = [];
    mockPrisma.chatRoomParticipant = {
      findUnique: (async (args: any) => {
        seen.push(args);
        return { id: 1 };
      }) as never,
    };

    const res = makeRes();
    await ticketRoute(
      makeReq({
        session: { user: { id: USER_ID } },
        body: { roomId: ROOM_ID },
      }) as never,
      res as never,
    );

    expect(seen).toEqual([
      {
        where: { roomId_userId: { roomId: ROOM_ID, userId: USER_ID } },
        select: { id: true },
      },
    ]);
    expect(res.statusCode).toBe(200);
    const body = res.body as { ticket: string; roomScope: number };
    expect(body.roomScope).toBe(ROOM_ID);

    const { verifyRealtimeTicket } = await import('@/lib/realtimeTicket');
    expect(
      await verifyRealtimeTicket(JWT_SECRET_FOR_TEST, body.ticket, {
        expectedRoomId: ROOM_ID,
      }),
    ).toEqual({ ok: true, userId: USER_ID, roomId: ROOM_ID });
  });

  it('answers 403 with the join error for a non-participant', async () => {
    mockPrisma.chatRoomParticipant = {
      findUnique: (async () => null) as never,
    };

    const res = makeRes();
    await ticketRoute(
      makeReq({
        session: { user: { id: USER_ID } },
        body: { roomId: ROOM_ID },
      }) as never,
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: 'You are not a participant in this chat room.',
    });
  });

  it('answers 403 when the room does not exist', async () => {
    mockPrisma.chatRoom = {
      findUnique: (async () => null) as never,
    };

    const res = makeRes();
    await ticketRoute(
      makeReq({
        session: { user: { id: USER_ID } },
        body: { roomId: ROOM_ID },
      }) as never,
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Room not found.' });
  });

  it('refuses to issue tickets without JWT_SECRET (500)', async () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const res = makeRes();
      await ticketRoute(
        makeReq({ session: { user: { id: USER_ID } }, body: {} }) as never,
        res as never,
      );
      expect(res.statusCode).toBe(500);
    } finally {
      if (previous !== undefined) process.env.JWT_SECRET = previous;
    }
  });

  it('rejects malformed bodies (400)', async () => {
    const res = makeRes();
    await ticketRoute(
      makeReq({
        session: { user: { id: USER_ID } },
        body: { roomId: -5 },
      }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message', 'Invalid request body');
  });
});
