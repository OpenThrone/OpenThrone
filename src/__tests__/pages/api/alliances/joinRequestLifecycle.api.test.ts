import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// The route -> AllianceService contract for joining and the join-request
// lifecycle. The service is mocked; prisma is only used by the route itself
// for the join_mode lookup.
const joinAlliance = vi.fn();
const createJoinRequest = vi.fn();
const getJoinRequests = vi.fn();
const acceptJoinRequest = vi.fn();
const rejectJoinRequest = vi.fn();
mock.module('@/services', () => ({
  AllianceService: {
    joinAlliance,
    createJoinRequest,
    getJoinRequests,
    acceptJoinRequest,
    rejectJoinRequest,
  },
}));

const joinRoute = require('../../../../pages/api/alliances/join').default;
const listRequestsRoute =
  require('../../../../pages/api/alliances/requests/index').default;
const acceptRoute =
  require('../../../../pages/api/alliances/requests/accept').default;
const rejectRoute =
  require('../../../../pages/api/alliances/requests/reject').default;

const APPLICANT_ID = 6;
const OFFICER_ID = 5;
const ALLIANCE_ID = 3;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  method: string,
  extra: { body?: unknown; query?: unknown; session?: object | null } = {},
) => ({
  method,
  headers: {},
  session:
    extra.session === undefined
      ? { user: { id: APPLICANT_ID } }
      : extra.session,
  body: extra.body ?? {},
  query: extra.query ?? {},
});

let joinMode: string | null = 'OPEN';

beforeEach(() => {
  resetMockPrisma();
  joinMode = 'OPEN';
  mockPrisma.alliances = {
    findUnique: vi.fn(async () =>
      joinMode === null ? null : { join_mode: joinMode },
    ),
  };
  for (const fn of [
    joinAlliance,
    createJoinRequest,
    getJoinRequests,
    acceptJoinRequest,
    rejectJoinRequest,
  ]) {
    fn.mockReset();
  }
});

describe('POST /api/alliances/join', () => {
  it('joins directly when the alliance is OPEN', async () => {
    joinAlliance.mockResolvedValue({ allianceId: ALLIANCE_ID, success: true });
    const res = makeRes();

    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      res,
    );

    expect(mockPrisma.alliances.findUnique).toHaveBeenCalledWith({
      where: { id: ALLIANCE_ID },
      select: { join_mode: true },
    });
    expect(joinAlliance).toHaveBeenCalledWith(APPLICANT_ID, {
      allianceId: ALLIANCE_ID,
      expectedFee: null,
    });
    expect(createJoinRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      allianceId: ALLIANCE_ID,
      success: true,
    });
  });

  it('passes the join fee the player confirmed to the service', async () => {
    joinAlliance.mockResolvedValue({ allianceId: ALLIANCE_ID, success: true });
    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, expectedFee: 2500 } }),
      makeRes(),
    );
    expect(joinAlliance).toHaveBeenCalledWith(APPLICANT_ID, {
      allianceId: ALLIANCE_ID,
      expectedFee: 2500,
    });
  });

  it('rejects a malformed confirmed fee', async () => {
    const res = makeRes();
    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, expectedFee: -1 } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(joinAlliance).not.toHaveBeenCalled();
  });

  it('files a join request when the alliance is REQUEST_TO_JOIN', async () => {
    joinMode = 'REQUEST_TO_JOIN';
    createJoinRequest.mockResolvedValue({
      id: 11,
      alliance_id: ALLIANCE_ID,
      user_id: APPLICANT_ID,
      status: 'PENDING',
    });
    const res = makeRes();

    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      res,
    );

    expect(createJoinRequest).toHaveBeenCalledWith(APPLICANT_ID, ALLIANCE_ID);
    expect(joinAlliance).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 11,
      alliance_id: ALLIANCE_ID,
      user_id: APPLICANT_ID,
      status: 'PENDING',
    });
  });

  it('refuses invite-only alliances without calling any service', async () => {
    joinMode = 'INVITE_ONLY';
    const res = makeRes();

    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This alliance is invite-only',
    });
    expect(joinAlliance).not.toHaveBeenCalled();
    expect(createJoinRequest).not.toHaveBeenCalled();
  });

  it('returns 404 when the alliance does not exist', async () => {
    joinMode = null;
    const res = makeRes();

    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Alliance not found' });
    expect(joinAlliance).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric allianceId with field errors', async () => {
    const res = makeRes();

    await joinRoute(makeReq('POST', { body: { allianceId: 'three' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid request body',
      details: { allianceId: [expect.stringContaining('number')] },
    });
    expect(mockPrisma.alliances.findUnique).not.toHaveBeenCalled();
  });

  it('sanitizes service failures to a 400 domain message', async () => {
    joinAlliance.mockRejectedValue(new Error('You are already in an alliance'));
    const res = makeRes();

    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You are already in an alliance',
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes();

    await joinRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });
});

describe('join request lifecycle (join -> list -> accept/reject)', () => {
  it('walks create -> list -> accept with the same request id and actors', async () => {
    joinMode = 'REQUEST_TO_JOIN';
    createJoinRequest.mockResolvedValue({
      id: 11,
      alliance_id: ALLIANCE_ID,
      user_id: APPLICANT_ID,
      status: 'PENDING',
    });
    getJoinRequests.mockResolvedValue([
      { id: 11, user_id: APPLICANT_ID, status: 'PENDING' },
    ]);
    acceptJoinRequest.mockResolvedValue({
      id: 21,
      alliance_id: ALLIANCE_ID,
      user_id: APPLICANT_ID,
    });

    // 1. Applicant files the request against a REQUEST_TO_JOIN alliance.
    const joinRes = makeRes();
    await joinRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID } }),
      joinRes,
    );
    expect(joinRes.status).toHaveBeenCalledWith(200);
    expect(createJoinRequest).toHaveBeenCalledWith(APPLICANT_ID, ALLIANCE_ID);

    // 2. An officer lists the pending requests.
    const listRes = makeRes();
    await listRequestsRoute(
      makeReq('GET', {
        query: { allianceId: String(ALLIANCE_ID) },
        session: { user: { id: OFFICER_ID } },
      }),
      listRes,
    );
    expect(getJoinRequests).toHaveBeenCalledWith(ALLIANCE_ID, OFFICER_ID);
    expect(listRes.status).toHaveBeenCalledWith(200);
    expect(listRes.json).toHaveBeenCalledWith([
      { id: 11, user_id: APPLICANT_ID, status: 'PENDING' },
    ]);

    // 3. The officer accepts; the route forwards (requestId, officer id).
    const acceptRes = makeRes();
    await acceptRoute(
      makeReq('POST', {
        body: { requestId: 11 },
        session: { user: { id: OFFICER_ID } },
      }),
      acceptRes,
    );
    expect(acceptJoinRequest).toHaveBeenCalledWith(11, OFFICER_ID);
    expect(acceptRes.status).toHaveBeenCalledWith(200);
    expect(acceptRes.json).toHaveBeenCalledWith({
      id: 21,
      alliance_id: ALLIANCE_ID,
      user_id: APPLICANT_ID,
    });
  });

  it('closes the request via reject with the same contract', async () => {
    rejectJoinRequest.mockResolvedValue({ id: 11, status: 'REJECTED' });
    const res = makeRes();

    await rejectRoute(
      makeReq('POST', {
        body: { requestId: 11 },
        session: { user: { id: OFFICER_ID } },
      }),
      res,
    );

    expect(rejectJoinRequest).toHaveBeenCalledWith(11, OFFICER_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 11, status: 'REJECTED' });
  });
});

describe('GET /api/alliances/requests', () => {
  it('requires allianceId in the query', async () => {
    const res = makeRes();

    await listRequestsRoute(makeReq('GET', { query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'allianceId is required' });
    expect(getJoinRequests).not.toHaveBeenCalled();
  });

  it('returns 403 with the refusal message when the viewer lacks permission', async () => {
    getJoinRequests.mockRejectedValue(new Error('No permission'));
    const res = makeRes();

    await listRequestsRoute(
      makeReq('GET', { query: { allianceId: String(ALLIANCE_ID) } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'No permission' });
  });

  it('hides unexpected failures behind a generic 500 message', async () => {
    getJoinRequests.mockRejectedValue(
      Object.assign(new Error('PrismaClientKnownRequestError select failed'), {
        name: 'PrismaClientKnownRequestError',
      }),
    );
    const res = makeRes();

    await listRequestsRoute(
      makeReq('GET', { query: { allianceId: String(ALLIANCE_ID) } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Could not load join requests',
    });
  });

  it('returns 405 for non-GET methods', async () => {
    const res = makeRes();

    await listRequestsRoute(makeReq('POST'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });
});

describe('POST /api/alliances/requests/accept + reject validation', () => {
  it.each([
    ['accept', acceptRoute, acceptJoinRequest],
    ['reject', rejectRoute, rejectJoinRequest],
  ] as const)(
    '%s rejects an invalid body without calling the service',
    async (_label, route, serviceFn) => {
      const res = makeRes();

      await route(makeReq('POST', { body: { requestId: -1 } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid request body',
        details: { requestId: [expect.stringContaining('greater than 0')] },
      });
      expect(serviceFn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['accept', acceptRoute, acceptJoinRequest],
    ['reject', rejectRoute, rejectJoinRequest],
  ] as const)(
    '%s sanitizes service failures to 400',
    async (_label, route, serviceFn) => {
      serviceFn.mockRejectedValue(new Error('No permission'));
      const res = makeRes();

      await route(makeReq('POST', { body: { requestId: 11 } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No permission' });
    },
  );

  it.each([
    ['accept', acceptRoute],
    ['reject', rejectRoute],
  ] as const)('%s returns 405 for non-POST methods', async (_label, route) => {
    const res = makeRes();

    await route(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });
});
