import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

// Route-level tests: the AllianceService barrel is mocked so the route ->
// service contract (arguments, status codes, sanitized errors) stays pinned
// even as service internals evolve.
const createAlliance = vi.fn();
const getAllAlliances = vi.fn();
const getAllianceForViewer = vi.fn();
mock.module('@/services', () => ({
  AllianceService: {
    createAlliance,
    getAllAlliances,
    getAllianceForViewer,
  },
}));

const createRoute = require('../../../../pages/api/alliances/create').default;
const getAllRoute = require('../../../../pages/api/alliances/getAll').default;
const readRoute = require('../../../../pages/api/alliances/[id]').default;

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
  session: extra.session === undefined ? { user: { id: 5 } } : extra.session,
  body: extra.body ?? {},
  query: extra.query ?? {},
});

beforeEach(() => {
  resetMockPrisma();
  createAlliance.mockReset();
  getAllAlliances.mockReset();
  getAllianceForViewer.mockReset();
});

describe('POST /api/alliances/create', () => {
  it('creates via AllianceService and stringifies the BigInt treasury', async () => {
    createAlliance.mockResolvedValue({
      id: 3,
      name: 'Synthetic Pact',
      join_mode: 'OPEN',
      gold_in_bank: 900n,
    });
    const res = makeRes();

    await createRoute(
      makeReq('POST', {
        body: { name: 'Synthetic Pact', motto: 'Hold the line' },
      }),
      res,
    );

    expect(createAlliance).toHaveBeenCalledWith(5, {
      name: 'Synthetic Pact',
      avatar: undefined,
      motto: 'Hold the line',
      comments: undefined,
      join_mode: undefined,
      roster_visibility: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 3,
      name: 'Synthetic Pact',
      join_mode: 'OPEN',
      gold_in_bank: '900n',
    });
  });

  it('falls back to allianceName and trims whitespace', async () => {
    createAlliance.mockResolvedValue({ id: 4, name: 'Pact' });
    const res = makeRes();

    await createRoute(
      makeReq('POST', { body: { allianceName: '  Pact  ' } }),
      res,
    );

    expect(createAlliance).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ name: 'Pact' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a blank name before touching the service', async () => {
    const res = makeRes();

    await createRoute(makeReq('POST', { body: { name: '   ' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Alliance name is required',
    });
    expect(createAlliance).not.toHaveBeenCalled();
  });

  it('rejects an invalid body with field errors', async () => {
    const res = makeRes();

    await createRoute(
      makeReq('POST', { body: { name: 'Pact', join_mode: 'NOPE' } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid request body',
      details: { join_mode: [expect.stringContaining('Invalid enum value')] },
    });
    expect(createAlliance).not.toHaveBeenCalled();
  });

  it('surfaces a domain refusal but sanitizes internal errors', async () => {
    createAlliance.mockRejectedValueOnce(
      new Error('You are already in an alliance'),
    );
    createAlliance.mockRejectedValueOnce(
      Object.assign(new Error('prisma connection refused at db:5432'), {
        name: 'PrismaClientInitializationError',
      }),
    );

    const domain = makeRes();
    await createRoute(makeReq('POST', { body: { name: 'Pact' } }), domain);
    expect(domain.status).toHaveBeenCalledWith(400);
    expect(domain.json).toHaveBeenCalledWith({
      error: 'You are already in an alliance',
    });

    const internal = makeRes();
    await createRoute(makeReq('POST', { body: { name: 'Pact' } }), internal);
    expect(internal.status).toHaveBeenCalledWith(400);
    expect(internal.json).toHaveBeenCalledWith({
      error: 'Something went wrong. Please try again.',
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes();

    await createRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
    expect(createAlliance).not.toHaveBeenCalled();
  });
});

describe('GET /api/alliances/getAll', () => {
  it('lists alliances scoped to the session viewer', async () => {
    getAllAlliances.mockResolvedValue([{ id: 3, name: 'Synthetic Pact' }]);
    const res = makeRes();

    await getAllRoute(makeReq('GET'), res);

    expect(getAllAlliances).toHaveBeenCalledWith(undefined, 5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 3, name: 'Synthetic Pact' }]);
  });

  it('passes a null viewer when the session is absent', async () => {
    getAllAlliances.mockResolvedValue([]);
    const res = makeRes();

    await getAllRoute(makeReq('GET', { session: null }), res);

    expect(getAllAlliances).toHaveBeenCalledWith(undefined, null);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 with the sanitized error when listing fails', async () => {
    getAllAlliances.mockRejectedValue(new Error('boom'));
    const res = makeRes();

    await getAllRoute(makeReq('GET'), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'boom' });
  });

  it('returns 405 for non-GET methods', async () => {
    const res = makeRes();

    await getAllRoute(makeReq('POST'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });
});

describe('GET /api/alliances/[id]', () => {
  // Viewer-shape pruning (treasury/roster for non-members) is pinned at the
  // service level in allianceRead.api.test.ts; here we pin the route ->
  // getAllianceForViewer contract and error mapping.
  it('returns the alliance payload for the viewer', async () => {
    getAllianceForViewer.mockResolvedValue({
      alliance: { id: 3, name: 'Synthetic Pact', gold_in_bank: '900n' },
    });
    const res = makeRes();

    await readRoute(
      makeReq('GET', { query: { id: '3' }, session: { user: { id: 6 } } }),
      res,
    );

    expect(getAllianceForViewer).toHaveBeenCalledWith(3, 6);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 3,
      name: 'Synthetic Pact',
      gold_in_bank: '900n',
    });
  });

  it('maps a not-found service error to 404', async () => {
    getAllianceForViewer.mockRejectedValue(new Error('Alliance not found'));
    const res = makeRes();

    await readRoute(makeReq('GET', { query: { id: '999' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Alliance not found' });
  });

  it('rejects a missing or array id with 400', async () => {
    const missing = makeRes();
    await readRoute(makeReq('GET', { query: {} }), missing);
    expect(missing.status).toHaveBeenCalledWith(400);
    expect(missing.json).toHaveBeenCalledWith({ error: 'Invalid alliance ID' });

    const array = makeRes();
    await readRoute(makeReq('GET', { query: { id: ['1', '2'] } }), array);
    expect(array.status).toHaveBeenCalledWith(400);
    expect(getAllianceForViewer).not.toHaveBeenCalled();
  });

  it('returns 405 for non-GET methods', async () => {
    const res = makeRes();

    await readRoute(makeReq('POST', { query: { id: '3' } }), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });
});
