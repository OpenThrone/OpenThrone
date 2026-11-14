import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// Permission enforcement lives in AllianceService.updateAlliance (leader or
// officer with the manage permissions). The route contract pinned here: the
// authenticated user id rides along with the payload, the response is
// BigInt-stringified, and service refusals map to sanitized 400s.
const updateAlliance = vi.fn();
mock.module('@/services', () => ({
  AllianceService: { updateAlliance },
}));

const updateRoute = require('../../../../pages/api/alliances/update').default;

const LEADER_ID = 5;
const MEMBER_ID = 6;
const ALLIANCE_ID = 3;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const makeReq = (
  method: string,
  extra: { body?: unknown; session?: object | null } = {},
) => ({
  method,
  headers: {},
  session:
    extra.session === undefined ? { user: { id: LEADER_ID } } : extra.session,
  body: extra.body ?? {},
  query: {},
});

beforeEach(() => {
  resetMockPrisma();
  updateAlliance.mockReset();
});

describe('POST /api/alliances/update', () => {
  it('forwards only the provided fields with the acting user id', async () => {
    updateAlliance.mockResolvedValue({
      id: ALLIANCE_ID,
      motto: 'Hold the line',
      gold_in_bank: 900n,
    });
    const res = makeRes();

    await updateRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, motto: 'Hold the line' },
      }),
      res,
    );

    expect(updateAlliance).toHaveBeenCalledWith(ALLIANCE_ID, LEADER_ID, {
      motto: 'Hold the line',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    // Treasury columns are BigInt; the route must stringify before JSON.
    expect(res.json).toHaveBeenCalledWith({
      id: ALLIANCE_ID,
      motto: 'Hold the line',
      gold_in_bank: '900n',
    });
  });

  it('passes enum settings through when provided', async () => {
    updateAlliance.mockResolvedValue({ id: ALLIANCE_ID });
    const res = makeRes();

    await updateRoute(
      makeReq('POST', {
        body: {
          allianceId: ALLIANCE_ID,
          join_mode: 'REQUEST_TO_JOIN',
          roster_visibility: 'MEMBERS_ONLY',
        },
      }),
      res,
    );

    expect(updateAlliance).toHaveBeenCalledWith(ALLIANCE_ID, LEADER_ID, {
      join_mode: 'REQUEST_TO_JOIN',
      roster_visibility: 'MEMBERS_ONLY',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a body without a valid allianceId', async () => {
    const res = makeRes();

    await updateRoute(makeReq('POST', { body: { motto: 'Nope' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid request body',
      details: { allianceId: [expect.stringContaining('Required')] },
    });
    expect(updateAlliance).not.toHaveBeenCalled();
  });

  it('rejects an unknown join_mode enum value', async () => {
    const res = makeRes();

    await updateRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, join_mode: 'LOOSE' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateAlliance).not.toHaveBeenCalled();
  });

  it('surfaces the permission refusal for a member without rights', async () => {
    updateAlliance.mockRejectedValue(new Error('No permission'));
    const res = makeRes();

    await updateRoute(
      makeReq('POST', {
        body: { allianceId: ALLIANCE_ID, motto: 'Hostile takeover' },
        session: { user: { id: MEMBER_ID } },
      }),
      res,
    );

    // The member's id, not the leader's, must reach the permission check.
    expect(updateAlliance).toHaveBeenCalledWith(ALLIANCE_ID, MEMBER_ID, {
      motto: 'Hostile takeover',
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No permission' });
  });

  it('sanitizes internal failures to the generic message', async () => {
    updateAlliance.mockRejectedValue(
      Object.assign(
        new Error(
          'Unknown argument `motto2`. Available options are listed at prisma.io',
        ),
        {
          name: 'PrismaClientValidationError',
        },
      ),
    );
    const res = makeRes();

    await updateRoute(
      makeReq('POST', { body: { allianceId: ALLIANCE_ID, motto: 'x' } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong. Please try again.',
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes();

    await updateRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
    expect(updateAlliance).not.toHaveBeenCalled();
  });
});
